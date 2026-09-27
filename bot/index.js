const connection = require('./connection');
const sticker = require('./features/sticker');
const commandRouter = require('./commandRouter');

sticker.register(connection.bus, connection.logger);
commandRouter.register(connection.bus, connection.logger);

module.exports = {
  bus: connection.bus,
  init: connection.init,
  requestQrMode: connection.requestQrMode,
  requestPairingCode: connection.requestPairingCode,
  getState: connection.getState,
  getQRData: connection.getQRData,
};
