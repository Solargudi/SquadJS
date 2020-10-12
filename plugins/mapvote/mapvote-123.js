import { SquadLayerFilter } from 'core/squad-layers';
import { COPYRIGHT_MESSAGE } from 'core/constants';
import { NEW_GAME, CHAT_MESSAGE } from 'squad-server/events';

import MapVote from './mapvote.js';

export default {
  name: 'mapvote-123',
  description:
    'The <code>mapvote-123</code> plugin provides map voting functionality. This variant of map voting allows admins to specify ' +
    'a small number of maps which are numbered and announced in admin broadcasts. Players can then vote for the map ' +
    'their choice by typing the corresponding map number into chat.' +
    '\n\n' +
    'Player Commands:\n' +
    ' * <code>!mapvote help</code> - Show other commands players can use.\n' +
    ' * <code>!mapvote results</code> - Show the results of the current map vote.\n' +
    ' * <code><layer number></code> - Vote for a layer using the layer number.\n' +
    '\n\n' +
    'Admin Commands (Admin Chat Only):\n' +
    ' * <code>!mapvote start <layer name 1>, <layer name 2>, ...</code> - Start a new map vote with the specified maps.\n' +
    ' * <code>!mapvote restart</code> - Restarts the map vote with the same layers.\n' +
    ' * <code>!mapvote end</code> - End the map vote and announce the winner.\n' +
    ' * <code>!mapvote destroy</code> - End the map vote without announcing the winner.\n',

  defaultEnabled: false,
  optionsSpec: {
    minVoteCount: {
      required: false,
      description: 'The minimum number of votes required for the vote to succeed.',
      default: null,
      example: 3
    }
  },

  init: async (server, options) => {
    let mapvote = null;

    server.on(NEW_GAME, () => {
      mapvote = null;
    });

    server.on(CHAT_MESSAGE, async (info) => {
      const voteMatch = info.message.match(/^([0-9])/);
      if (voteMatch) {
        if (!mapvote) return;
        try {
          const layerName = await mapvote.makeVoteByNumber(info.steamID, parseInt(voteMatch[1]));
          await server.rcon.warn(info.steamID, `Вы проголосовали за ${layerName}.`);
        } catch (err) {
          await server.rcon.warn(info.steamID, err.message);
        }
        await server.rcon.warn(info.steamID, COPYRIGHT_MESSAGE);
      }

      const commandMatch = info.message.match(/^!mapvote ?(.*)/);
      if (commandMatch) {
        if (commandMatch[1].startsWith('start')) {
          

          if (mapvote) {
            await server.rcon.warn(info.steamID, 'Голосование уже началось.');
          } else {
			 const allMapsList = ['Al Basrah', 'Belaya', 'Chora', 'Fool\'s Road', 'Gorodok', 'Kamdesh', 'Kohat', 'Kokan', 'Lashkar Valley', 'Logar Valley', 'Mestia', 'Mutaha', 'Narva', 'Skorpo', 'Sumari', 'Tallil Outskirts', 'Yehorivka', 'Fallujah'];//, 'CAF Belaya', 'CAF Chora', 'CAF Fool\'s Road', 'CAF Gorodok', 'CAF Kamdesh', 'CAF Kohat', 'CAF Lashkar', 'CAF Manic-5', 'CAF Mestia', 'CAF Mutaha', 'CAF Nanisivik', 'CAF Narva', 'CAF Skorpo', 'CAF Tallil Outskirts', 'CAF Yehorivka'];
			  let randomIndex;
			  var chosenMaps = [];
			  for (let i = 0; i < 5; i++){
				randomIndex = Math.floor(Math.random() * allMapsList.length);
				chosenMaps.push(allMapsList[randomIndex]);
				//console.log(allMapsList[randomIndex]);
			  }
            mapvote = new MapVote(
              server,
              SquadLayerFilter.buildRandFromMapList(
				chosenMaps
              ),
              { minVoteCount: options.minVoteCount }
            );

            mapvote.on('NEW_WINNER', async (results) => {
              await server.rcon.broadcast(
                `Победитель голосования: ${results[0].layer.layer}.`
              );
            });

            await server.rcon.broadcast(
              `Запущено голосование за выбор карты.`
            );
            await server.rcon.broadcast(
              mapvote.squadLayerFilter
                .getLayerNames()
                .map((layerName, key) => `${key + 1} - ${layerName}`)
                .join(', ')
            );
          }
          return;
        }

        if (!mapvote) {
          await server.rcon.warn(info.steamID, 'Голосование ещё не началось. Для его запуска введите !mapvote start');
          return;
        }

        if (commandMatch[1] === 'restart') {
          if (info.chat !== 'ChatAdmin') return;

          mapvote = new MapVote(server, mapvote.squadLayerFilter, {
            minVoteCount: options.minVoteCount
          });

          mapvote.on('NEW_WINNER', async (results) => {
            await server.rcon.broadcast(
              `Победитель голосвания: ${results[0].layer}. Чтобы узнать подробности голосования, введите "!mapvote help" в чат.`
            );
          });

          await server.rcon.broadcast(
            `Голосование запущено. Чтобы узнать подробности голосования, введите "!mapvote help" в чат.`
          );
          await server.rcon.broadcast(
            mapvote.squadLayerFilter
              .getLayerNames()
              .map((layerName, key) => `${key + 1} - ${layerName}`)
              .join(', ')
          );
          return;
        }

        if (commandMatch[1] === 'end') {
          if (info.chat !== 'ChatAdmin') return;

          const results = mapvote.getResults();

          if (results.length === 0)
            await server.rcon.broadcast(`Недостаточно голосов для победы в голосовании.`);
          else
            await server.rcon.broadcast(`${mapvote.getResults()[0].layer.layer} победила в голосовании!`);

          mapvote = null;
          return;
        }

        if (commandMatch[1] === 'destroy') {
          if (info.chat !== 'ChatAdmin') return;
          mapvote = null;
          return;
        }

        if (commandMatch[1] === 'help') {
          await server.rcon.warn(info.steamID, 'To vote type the layer number into chat:');
          for (const layer of mapvote.squadLayerFilter.getLayers()) {
            await server.rcon.warn(info.steamID, `${layer.layerNumber} - ${layer.layer}`);
          }

          if (options.minVoteCount !== null)
            await server.rcon.warn(
              info.steamID,
              `Требуется ${options.minVoteCount} голосов, чтобы карта победила в голосовании.`
            );

          await server.rcon.warn(
            info.steamID,
            'To see current results type into chat: !mapvote results'
          );
        }

        if (commandMatch[1] === 'results') {
          const results = mapvote.getResults();

          if (results.length === 0) {
            await server.rcon.warn(info.steamID, 'Никто еще не проголосовал.');
          } else {
            await server.rcon.warn(info.steamID, 'The current vote counts are as follows:');
            for (const result of results) {
              await server.rcon.warn(
                info.steamID,
                `${result.layer.layerNumber} - ${result.layer.layer} (${result.votes} vote${
                  result.votes > 1 ? 's' : ''
                })`
              );
            }
          }
        }
      }
    });
  }
};
