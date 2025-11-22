import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  canActivate(context: ExecutionContext): boolean {
    try {
      const client = context.switchToWs().getClient();
      const userId = client.data?.userId;

      if (!userId) {
        this.logger.warn('WebSocket request without authenticated user');
        throw new WsException('Unauthorized');
      }

      return true;
    } catch (error) {
      this.logger.error(`WebSocket guard error: ${error.message}`);
      throw new WsException('Unauthorized');
    }
  }
}
