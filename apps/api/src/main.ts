import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

// .env vive en la raíz del monorepo; fallback al cwd para soportar otros layouts.
loadEnv({ path: join(__dirname, '..', '..', '..', '..', '.env') });
loadEnv();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`api listening on :${port}`);
}

bootstrap();
