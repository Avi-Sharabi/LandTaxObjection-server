import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface GraphMessage {
  id: string;
  subject: string | null;
  body: { content: string; contentType: string };
  /** First 255 chars of the email as plain text — provided by Graph API directly. */
  bodyPreview: string | null;
  from: { emailAddress: { address: string; name: string } };
  receivedDateTime: string;
  isRead: boolean;
  conversationId: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: Date;
}

// Proactively refresh the token 5 minutes before it expires to avoid mid-poll failures
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Microsoft's standard token lifetime when expires_in is absent from the response
const DEFAULT_TOKEN_EXPIRY_SECONDS = 3600;

@Injectable()
export class MsGraphService {
  private readonly logger = new Logger(MsGraphService.name);

  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  readonly mailboxUserId: string;

  private tokenCache: TokenCache | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.tenantId = this.config.getOrThrow<string>('GRAPH_TENANT_ID');
    this.clientId = this.config.getOrThrow<string>('GRAPH_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('GRAPH_CLIENT_SECRET');
    this.mailboxUserId = this.config.getOrThrow<string>('GRAPH_MONITORED_MAILBOX');
  }

  /**
   * Returns a valid access token, fetching a new one from Azure AD when the
   * cached token is absent or within TOKEN_REFRESH_BUFFER_MS of expiry.
   */
  private async resolveAccessToken(): Promise<string> {
    const now = new Date();
    const bufferDeadline = new Date(now.getTime() + TOKEN_REFRESH_BUFFER_MS);

    if (this.tokenCache && this.tokenCache.expiresAt > bufferDeadline) {
      return this.tokenCache.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await firstValueFrom(
      this.http.post<{ access_token: string; expires_in: number }>(
        tokenUrl,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );

    const expiresIn = response.data.expires_in ?? DEFAULT_TOKEN_EXPIRY_SECONDS;
    this.tokenCache = {
      accessToken: response.data.access_token,
      expiresAt: new Date(now.getTime() + expiresIn * 1000),
    };

    this.logger.debug('[MS-GRAPH] Access token refreshed');
    return this.tokenCache.accessToken;
  }

  // Fetches inbox messages received within the last 7 days regardless of read status.
  // Using a rolling window instead of isRead — shared mailboxes auto-read on delivery.
  // Deduplication is handled by the caller via message_id idempotency check.
  async fetchInboxMessages(maxMessages = 50): Promise<GraphMessage[]> {
    const token = await this.resolveAccessToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.mailboxUserId)}/mailFolders/inbox/messages`;

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString();

    const response = await firstValueFrom(
      this.http.get<{ value: GraphMessage[] }>(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          $filter: `receivedDateTime ge ${sinceIso}`,
          $orderby: 'receivedDateTime asc',
          $top: maxMessages,
          $select: 'id,subject,body,bodyPreview,from,receivedDateTime,isRead,conversationId',
        },
      }),
    );

    return response.data.value ?? [];
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    const token = await this.resolveAccessToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.mailboxUserId)}/messages/${messageId}`;

    await firstValueFrom(
      this.http.patch(
        url,
        { isRead: true },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      ),
    );
  }
}
