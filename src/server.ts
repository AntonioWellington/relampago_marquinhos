import { z } from 'zod';
import type { ErrorResponse, StationGroup, Response } from './main.types.ts';
import { curry, Logger } from './utils.ts';

import * as net from 'node:net';

const HOST = 'localhost';
const PORT = 8080;

const addReservation = curry(
  (
    stations: StationGroup,
    idStation: number,
    idUser: number,
  ): {
    success: boolean;
    message: string;
  } => {
    const station = stations[idStation];

    if (!station) {
      // retutn error
      return {
        success: false,
        message: 'station does not exist',
      };
    }

    // verificar se ja tem reserva
    const hasReservationOnThisStation = station.reservations.includes(idUser);

    const hasAnyOtherReservation = Object.entries(stations).reduce(
      (prev, station) => {
        return station[1].reservations.includes(idUser) || prev;
      },
      false,
    );

    if (hasAnyOtherReservation) {
      return {
        success: false,
        message: 'There is already a reservation',
      };
    }

    // Verificar se carro tem reserva em algum posto
    if (!hasReservationOnThisStation) {
      // faz a reseva
      station.reservations.push(idUser);
    }

    // retorna sucesso
    return {
      success: true,
      message: `Reserved station ${station.id}`,
    };
  },
);

const STATIONS: StationGroup = {
  12: {
    id: 12,
    location: {
      x: 0,
      y: 1,
    },
    reservations: [],
    state: 'avaliable',
    suggestions: [],
  },
};

export const connectionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reserve'),
    data: z.object({
      userId: z.number(),
      stationId: z.number(),
    }),
  }),
]);

const log = Logger.extend('Server');
const server = net.createServer(socket => {
  log.info('Client connected:', socket.remoteAddress + ':' + socket.remotePort);

  socket.on('data', d => {
    // verifica se os dados estão no formato esperado
    const data = connectionSchema.safeParse(JSON.parse(d.toString()));

    if (!data.success) {
      // return error
      // invalid data format
      socket.write(
        JSON.stringify({
          message: 'erro',
          success: false,
          error: JSON.stringify(data.error, null, 2),
        } satisfies ErrorResponse<unknown>),
      );
      return;
    }

    if (data.data.type === 'reserve') {
      const result = addReservation(
        STATIONS,
        data.data.data.stationId,
        data.data.data.userId,
      );
      socket.write(
        JSON.stringify({
          message: result.message,
          success: result.success,
          data: undefined,
        } satisfies Response<unknown>),
      );
      return;
    }
    log.info(`Received: ${data}`);

    const response = `Server received: ${data}`;
    socket.write(
      JSON.stringify({
        message: 'sucesso',
        success: true,
        data: response,
      } satisfies Response<string>),
    );
    log.info(`Sent: ${response}`);
  });

  socket.on('end', () => {
    log.debug('Client disconnected');
  });

  socket.on('error', err => {
    log.error(`Socket error: ${err.message}`);
  });
});

server.listen(PORT, HOST, () => {
  log.info(`Server listening on ${HOST}:${PORT}`);
});

server.on('error', err => {
  log.error(`Server error: ${err.message}`);
});
