import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class PersonWriteGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const token = this.config.get<string>('PERSON_WRITE_TOKEN');
    if (!token) throw new ServiceUnavailableException('Person creation is not configured');
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    const actual = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('Invalid write token');
    }
    return true;
  }
}
