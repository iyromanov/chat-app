import { AuthGateway } from './auth.gateway';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CONFIG, type Config } from '../common/config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';
import { LocalAuthGuard } from './local-auth.guard';
import { JWT_AUDIENCE, JWT_ISSUER, LIFETIME } from './auth.constants';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (config: Config) => ({
        secret: config.JWT_SECRET,
        signOptions: {
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: LIFETIME,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGateway,
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    LocalAuthGuard,
    LocalStrategy,
    JwtStrategy,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
