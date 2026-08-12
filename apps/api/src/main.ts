import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppConfig } from './config/app-config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const config = app.get(AppConfig);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: config.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.enableShutdownHooks();

  await app.listen(config.env.PORT, config.env.HOST);
  Logger.log(
    `API listening on http://${config.env.HOST}:${config.env.PORT} (${config.env.NODE_ENV})`,
    'Bootstrap',
  );
}

bootstrap();
