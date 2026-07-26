import { Module } from '@nestjs/common';
import { ShipmentController, ShipmentEventController, ShipmentPackageController } from './shipment-state-machine.controller';
import { ShipmentStateMachineRepository, InMemoryShipmentStateMachineRepository } from './shipment-state-machine.repository';

@Module({
  controllers: [ShipmentController, ShipmentEventController, ShipmentPackageController],
  providers: [
    {
      provide: ShipmentStateMachineRepository,
      useClass: InMemoryShipmentStateMachineRepository,
    },
  ],
  exports: [ShipmentStateMachineRepository],
})
export class ShipmentStateMachineModule {}
