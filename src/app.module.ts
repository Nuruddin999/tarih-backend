import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: env => {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const port = Number(env.PORT ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
    return { ...env, PORT: port };
  } }), PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
