import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  const origins = config.get<string>('CORS_ORIGINS', '').split(',').map(value => value.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins });
  app.enableShutdownHooks();
  await app.listen(config.get<number>('PORT', 3001));
}
bootstrap().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
