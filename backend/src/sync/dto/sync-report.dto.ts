import { IsNumber, Min } from 'class-validator';

export class SyncReportDto {
  @IsNumber()
  @Min(0)
  rtt: number;
}
