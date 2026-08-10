import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { json, urlencoded } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');

async function bootstrap() {

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const trustProxyHops = process.env.TRUST_PROXY_HOPS;
  if (trustProxyHops) {
    app.set(
      'trust proxy',
      isNaN(Number(trustProxyHops)) ? trustProxyHops : Number(trustProxyHops),
    );
  }

  const whitelist =
    process.env.CORS_WHITELIST?.split(',').map((origin) => origin.trim()) || [];
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  });

  app.use(cookieParser());
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.enableVersioning({
    type: VersioningType.URI,
  });

  // Order matters: Nest evaluates global filters in reverse registration order,
  // so DomainExceptionFilter is consulted first and AllExceptionsFilter acts as
  // the backstop for everything else. Without the backstop, unrecognised errors
  // fall through to Nest's BaseExceptionFilter, which duck-types anything with
  // `statusCode` + `message` and relays it to the client verbatim.
  app.useGlobalFilters(new AllExceptionsFilter(), new DomainExceptionFilter());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('LandTaxDispute API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);


  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');

  console.log(`Application is running on: http://localhost:${process.env.PORT}`);
  console.log(`Swagger docs: http://localhost:${process.env.PORT ?? 3000}/api/docs`);
}

bootstrap();
