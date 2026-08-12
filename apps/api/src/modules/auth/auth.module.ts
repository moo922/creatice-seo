import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken, User } from '@creative-seo/database';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [AuthService, TokenService, JwtModule],
})
export class AuthModule {}
