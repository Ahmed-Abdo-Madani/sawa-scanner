import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { ADMIN_DASHBOARD_HTML } from './products/admin-dashboard-template';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('admin-dashboard')
  @Public()
  @Header('Content-Type', 'text/html')
  getAdminDashboard(): string {
    return ADMIN_DASHBOARD_HTML;
  }
}
