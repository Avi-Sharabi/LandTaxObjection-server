import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Client } from 'src/api/clients/entities/client.entity';

@Injectable()
export class XpmService {
  private readonly logger = new Logger(XpmService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  private buildXpmClientXml(client: Client): string {
    const escapeXml = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const tag = (name: string, value: string | null | undefined) =>
      value ? `  <${name}>${escapeXml(value)}</${name}>\n` : '';

    const dob = client.date_of_birth
      ? new Date(client.date_of_birth).toISOString().split('T')[0]
      : null;

    const accountManager = client.xpm_account_manager_uuid
      ? `  <AccountManager><UUID>${client.xpm_account_manager_uuid}</UUID></AccountManager>\n`
      : '';
    const jobManager = client.xpm_job_manager_uuid
      ? `  <JobManager><UUID>${client.xpm_job_manager_uuid}</UUID></JobManager>\n`
      : '';

    return (
      `<Client>\n` +
      tag('Name', client.name) +
      tag('Title', client.title) +
      tag('Gender', client.gender) +
      tag('FirstName', client.first_name) +
      tag('MiddleName', client.middle_name) +
      tag('LastName', client.last_name) +
      tag('Email', client.email) +
      tag('DateOfBirth', dob) +
      tag('Phone', client.phone) +
      tag('Fax', client.fax) +
      tag('Website', client.website) +
      tag('Address', client.address) +
      tag('City', client.city) +
      tag('Region', client.region) +
      tag('PostCode', client.postcode) +
      tag('Country', client.country) +
      tag('PostalAddress', client.postal_address) +
      tag('PostalCity', client.postal_city) +
      tag('PostalRegion', client.postal_region) +
      tag('PostalPostCode', client.postal_postcode) +
      tag('PostalCountry', client.postal_country) +
      tag('ReferralSource', client.referral_source) +
      tag('BusinessNumber', client.business_number) +
      tag('CompanyNumber', client.company_number) +
      tag('TaxNumber', client.tax_number) +
      tag('BusinessStructure', client.business_structure) +
      accountManager +
      jobManager +
      `</Client>`
    );
  }

  async createClientInXpm(client: Client): Promise<Partial<Client> | null> {
    if (client.xpm_uuid) return null;

    const baseUrl = this.config.get<string>('XPM_BASE_URL');
    if (!baseUrl) return null;

    const xpmHeaders = {
      'Ocp-Apim-Subscription-Key': this.config.get<string>('XPM_SUBSCRIPTION_KEY'),
      'X-Tenant-Id': this.config.get<string>('XPM_TENANT_ID'),
      'X-App-Id': this.config.get<string>('XPM_APP_ID'),
    };

    try {
      const xml = this.buildXpmClientXml(client);
      await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/practicemanager/clients`,
          xml,
          { headers: { 'Content-Type': 'application/xml', ...xpmHeaders } },
        ),
      );
    } catch (err) {
      this.logger.error(`Failed to create client in XPM: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }

    // POST response doesn't reliably return a UUID — search by name to retrieve the created record
    try {
      const searchResponse = await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/practicemanager/clients/search`,
          { params: { query: client.name }, headers: xpmHeaders },
        ),
      );

      const results: any[] = searchResponse.data?.data ?? [];
      if (!results.length) {
        this.logger.warn(`XPM client created for "${client.name}" but not found in search`);
        return null;
      }
      if (results.length > 1) {
        this.logger.warn(`XPM search returned ${results.length} matches for "${client.name}" — using first result`);
      }
      const xpmClient = results[0];

      this.logger.log(`XPM client synced: ${xpmClient.uuid} (${client.name})`);
      return {
        xpm_uuid: xpmClient.uuid ?? null,
        xpm_account_manager_uuid: xpmClient.accountManager?.uuid ?? null,
        xpm_account_manager_name: xpmClient.accountManager?.name ?? null,
        xpm_job_manager_uuid: xpmClient.jobManager?.uuid ?? null,
        xpm_job_manager_name: xpmClient.jobManager?.name ?? null,
        source: 'xpm',
      };
    } catch (err) {
      this.logger.error(`XPM client created but search failed: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }
  }
}
