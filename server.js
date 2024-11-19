require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { database, collection, addDoc, query, where, getDocs, updateDoc, doc, getDoc } = require('./firebase');
const token = process.env.API_KEY;
const bot = new TelegramBot(token, { polling: true });

const express = require('express');
const e = require('express');
const telegramBot = express();


telegramBot.set('port', 5000);
telegramBot.listen(telegramBot.get('port'), () => {
    console.log(`Server is running on port ${telegramBot.get('port')}`);
});

let userAccountCache = {};
const messageOwners = {};
const ITEMS_PER_PAGE = 5;

const defaultEquipment = {
    helmet: { name: "Nessun elmo", defense: 0, equip: true, effect: "HELMET" },
    chestplate: { name: "Nessuna corazza", defense: 0, equip: true, effect: "CHESTPLATE" },
    leggings: { name: "Nessun pantalone", defense: 0, equip: true, effect: "LEGGINGS" },
    boots: { name: "Nessun stivale", defense: 0, equip: true, effect: "BOOTS" },
    weapon: { name: "Pugno", attack: 5, equip: true, effect: "WEAPON" }
};

const rarityMultiplier = {
    "Common": 1.0,
    "Uncommon": 1.2,
    "Rare": 1.5,
    "Epic": 2.0
};

const raritySpawnChance = {
    "Common": 10.0,
    "Uncommon": 5.0,
    "Rare": 2.0,
    "Epic": 1.0
};

const optsBackToMain = {
    reply_markup: JSON.stringify({
        inline_keyboard: [[{
            text: 'Back',
            callback_data: 'back_to_main'
        }]]
    })
};

const adventureData = {
    place: "Montagna gelida",
    requiredLevel: 10,
    img: "",
    description: "",
    mobs: [
      {
        name: "Orco gelato",
        attack: 50,
        defense: 100,
        hp: 100,
        rarity: "Common",
        baseXp: 40,
        img: "",
        drops: [
          {
            name: "Mazza ghiacciata",
            effect: "WEAPON",
            attack: 52,
            price: 30,
            rarity: 90
          },
          {
            name: "Palla di Neve",
            effect: "",
            price: 5,
            rarity: 5
          },
            {
                name: "Gelato al cioccolato",
                effect: "",
                price: 10,
                rarity: 20
            },
            {
                name: "Pelle di orco",
                effect: "",
                price: 40,
                rarity: 60
            }

        ]
      },
      {
        name: "Lupo delle nevi",
        attack: 70,
        defense: 120,
        hp: 200,
        rarity: "Uncommon",
        baseXp: 60,
        img: "",
        drops: [
          {
            name: "Zanna di lupo",
            effect: "WEAPON",
            price: 50,
            rarity: 90,
            attack: 80
          },
          {
            name: "Pietra di ghiaccio",
            effect: "",
            price: 20,
            rarity: 40
          },
          {
            name: "Pelle di lupo",
            effect: "",
            price: 60,
            rarity: 70
          }
        ]
      },
      {
        name: "Yeti",
        attack: 120,
        defense: 100,
        hp: 300,
        rarity: "Rare",
        baseXp: 80,
        img: "",
        drops: [
          {
            name: "Artiglio del yeti",
            effect: "WEAPON",
            price: 150,
            rarity: 95,
            attack: 110
          },
          {
            name: "Pelo dello yeti",
            effect: "",
            price: 200,
            rarity: 80
          },
          {
             name: "Muco",
             effect: "",
             price: 10,
             rarity: 30
          }


        ]
      },
        {
            name: "Regina del Ghiaccio",
            attack: 300,
            defense: 150,
            hp: 300,
            rarity: "Epic",
            baseXp: 200,
            img: "",
            drops: [
            {
                name: "Scettro glaciale",
                effect: "WEAPON",
                price: 300,
                rarity: 100,
                attack: 200
            },
            {
                name: "Corona di ghiaccio",
                effect: "HELMET",
                price: 200,
                rarity: 100,
                defense: 200
            },
            {
                name: "Corazza di ghiaccio",
                effect: "CHESTPLATE",
                price: 200,
                rarity: 100,
                defense: 200
            },
            {
                name: "Pantaloni di ghiaccio",
                effect: "LEGGINGS",
                price: 200,
                rarity: 100,
                defense: 200
            },
            {
                name: "Stivali di ghiaccio",
                effect: "BOOTS",
                price: 200,
                rarity: 100,
                defense: 200
            }
            ]
        }
    ]
  };

bot.onText(/\/update/, (msg) => {
    //createAdventure(adventureData)
});

bot.onText(/\/play/, (msg) => {
    const userId = msg.from.id;
    const username = msg.from.username;
    const chatId = msg.chat.id;

    getCachedAccount(userId.toString())
        .then(account => {
            if (!account) {
                createAccount(userId.toString(), username)
                    .then(() => {
                        bot.sendMessage(chatId, 'Account creato con successo! Benvenuto!');
                    })
                    .catch(error => {
                        console.log('Errore durante la creazione dell\'account:', error);
                        bot.sendMessage(chatId, 'Si è verificato un errore durante la creazione dell\'account. Si prega di riprovare più tardi.');
                    });
            } else {
                const opts = {
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: 'Daily Bonus', callback_data: 'dailybonus' }],
                            [{ text: 'Shop', callback_data: 'shop' }],
                            [{ text: 'Items', callback_data: 'items_page_1' }],
                            [{ text: 'Adventure', callback_data: 'adventure' }],
                            [{ text: 'Inventory', callback_data: 'inventory' }],
                        ]
                    })
                };
                bot.sendMessage(chatId, `Bentornato ${account.username}!\nLivello: ${account.level}\nExp: ${account.xp}/${account.xpTop}\nCoins: ${account.coins}`, opts)
                    .then(sentMessage => {
                        messageOwners[sentMessage.message_id] = userId;
                    });
            }
        });
});

bot.on('callback_query', (callbackQuery) => {
    const userId = callbackQuery.from.id;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;


    if (messageOwners[messageId] !== userId) {
        bot.answerCallbackQuery(callbackQuery.id, {
            text: "Non puoi interagire con questo messaggio.",
            show_alert: true
        });
        return;
    }

    const data = callbackQuery.data;

    if (data === 'dailybonus') {
        checkDailyBonus(userId.toString())
            .then(canGetBonus => {
                if (canGetBonus) {
                    getCachedAccount(userId.toString())
                        .then(account => {
                            const newCoins = account.coins + 100;
                            const newDailyBonus = new Date();
                            newDailyBonus.setDate(newDailyBonus.getDate() + 1);
                            newDailyBonus.setHours(0, 0, 0, 0);
                            updateDoc(doc(database, `users/${account.id}`), {
                                coins: newCoins,
                                dailyBonus: newDailyBonus
                            })
                                .then(() => {
                                    invalidateCache(userId.toString());
                                    bot.editMessageText('Bonus giornaliero di 100 coins ritirato con successo!', {
                                        chat_id: chatId,
                                        message_id: messageId,
                                        reply_markup: optsBackToMain.reply_markup
                                    });
                                })
                                .catch(error => {
                                    console.log('Errore durante il ritiro del bonus giornaliero:', error);
                                    bot.editMessageText('Si è verificato un errore durante il ritiro del bonus giornaliero. Si prega di riprovare più tardi.', {
                                        chat_id: chatId,
                                        message_id: messageId,
                                        reply_markup: optsBackToMain.reply_markup
                                    });
                                });
                        })
                        .catch(error => {
                            console.log('Errore durante il recupero dell\'account:', error);
                            bot.editMessageText('Si è verificato un errore durante il recupero dell\'account. Si prega di riprovare più tardi.', {
                                chat_id: chatId,
                                message_id: messageId,
                                reply_markup: optsBackToMain.reply_markup
                            });
                        });
                } else {
                    bot.editMessageText('Hai già ritirato il bonus giornaliero.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: optsBackToMain.reply_markup
                    });
                }
            })
            .catch(error => {
                console.log('Errore durante il controllo del bonus giornaliero:', error);
                bot.editMessageText('Si è verificato un errore durante il controllo del bonus giornaliero. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: optsBackToMain.reply_markup
                });
            });
    } else if (data.startsWith('shop')) {
        const page = parseInt(data.split('_')[1] || '0', 10);
        let shopItems = [];
        getDocs(collection(database, 'items'))
            .then(querySnapshot => {
                querySnapshot.forEach(doc => {
                    shopItems.push({ id: doc.id, ...doc.data() });
                });

                const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
                const startIndex = page * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;

                const itemsForPage = shopItems.slice(startIndex, endIndex);

                let items = [];
                for (let i = 0; i < itemsForPage.length; i++) {
                    const item = itemsForPage[i];
                    items.push([{
                        text: `Acquista ${item.name} per ${item.price} coins`,
                        callback_data: `buy_${item.id}`
                    }]);
                }

                let navigationButtons = [];
                if (page > 0) {
                    navigationButtons.push({
                        text: "⬅️ Indietro",
                        callback_data: `shop_${page - 1}`
                    });
                }
                if (page < totalPages - 1) {
                    navigationButtons.push({
                        text: "➡️ Avanti",
                        callback_data: `shop_${page + 1}`
                    });
                }

                if (navigationButtons.length > 0) {
                    items.push(navigationButtons);
                }

                items.push([{
                    text: "Back",
                    callback_data: "back_to_main"
                }]);

                const opts = {
                    reply_markup: JSON.stringify({
                        inline_keyboard: items
                    })
                };

                bot.editMessageText('Negozio', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: opts.reply_markup
                });

            })
            .catch(error => {
                console.log('Errore durante il recupero degli oggetti del negozio:', error);
                bot.editMessageText('Si è verificato un errore durante il recupero degli oggetti del negozio. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: JSON.stringify({
                        inline_keyboard: [[{
                            text: "Back",
                            callback_data: "back_to_main"
                        }]]
                    })
                });
            });
    } else if (data.startsWith('buy_')) {
        const itemId = data.split('_')[1];
        getCachedAccount(userId.toString())
            .then(account => {
                getDoc(doc(database, `items/${itemId}`))
                    .then(shopItem => {
                        shopItem = { id: shopItem.id, ...shopItem.data() };
                        if (account.coins >= shopItem.price) {
                            const newCoins = account.coins - shopItem.price;
                            updateDoc(doc(database, `users/${account.id}`), {
                                coins: newCoins,
                                items: [...account.items, { ...shopItem }]
                            })
                                .then(() => {
                                    invalidateCache(userId.toString());
                                    bot.editMessageText(`Hai acquistato ${shopItem.name} per ${shopItem.price} coins!`, {
                                        chat_id: chatId,
                                        message_id: messageId,
                                        reply_markup: optsBackToMain.reply_markup
                                    });
                                })
                                .catch(error => {
                                    console.log('Errore durante l\'acquisto dell\'oggetto:', error);
                                    bot.editMessageText('Si è verificato un errore durante l\'acquisto dell\'oggetto. Si prega di riprovare più tardi.', {
                                        chat_id: chatId,
                                        message_id: messageId,
                                        reply_markup: optsBackToMain.reply_markup
                                    });
                                });
                        } else {
                            bot.editMessageText('Non hai abbastanza coins per acquistare questo oggetto.', {
                                chat_id: chatId,
                                message_id: messageId,
                                reply_markup: optsBackToMain.reply_markup
                            });
                        }
                    })
                    .catch(error => {
                        console.log('Errore durante il recupero dell\'oggetto del negozio:', error);
                        bot.editMessageText('Si è verificato un errore durante il recupero dell\'oggetto del negozio. Si prega di riprovare più tardi.', {
                            chat_id: chatId,
                            message_id: messageId
                        });
                    });
            })
            .catch(error => {
                console.log('Errore durante il recupero dell\'account:', error);
                bot.editMessageText('Si è verificato un errore durante il recupero dell\'account. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
    } else if (data.startsWith('items_page_')) {

        const page = parseInt(data.split('_').pop(), 10);
        handleItemsCommand(chatId, messageId, userId, page);

    } else if (data === 'back_to_main') {
        getCachedAccount(userId.toString())
            .then(account => {
                const opts = {
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: 'Daily Bonus', callback_data: 'dailybonus' }],
                            [{ text: 'Shop', callback_data: 'shop' }],
                            [{ text: 'Items', callback_data: 'items_page_1' }],
                            [{ text: 'Adventure', callback_data: 'adventure' }],
                            [{ text: 'Inventory', callback_data: 'inventory' }],
                        ]
                    })
                };
                bot.editMessageText(`Bentronato ${account.username}!\n Livello: ${account.level}\n Exp: ${account.xp}/${account.xpTop}\n Coins: ${account.coins}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: opts.reply_markup
                });
            })
            .catch(error => {
                console.log('Errore durante il recupero dell\'account:', error);
                bot.editMessageText('Si è verificato un errore durante il recupero dell\'account. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
    } else if (data === 'inventory') {
        getCachedAccount(userId.toString())
            .then(account => {
                const opts = {
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: `${account.helmet.name} (+${account.helmet.defense}DEF)`, callback_data: 'equip_helmet' }],
                            [{ text: `${account.chestplate.name} (+${account.chestplate.defense}DEF)`, callback_data: 'equip_chestplate' }],
                            [{ text: `${account.leggings.name} (+${account.leggings.defense}DEF)`, callback_data: 'equip_leggings' }],
                            [{ text: `${account.boots.name} (+${account.boots.defense}DEF)`, callback_data: 'equip_boots' }],
                            [{ text: `${account.weapon.name} (+${account.weapon.attack}ATK)`, callback_data: 'equip_weapon' }],
                            [{ text: 'Back', callback_data: 'back_to_main' }]
                        ]
                    })
                };
                bot.editMessageText(`Inventario di ${account.username}:\n\nElmo: ${account.helmet.name}\nCorazza: ${account.chestplate.name}\nPantaloni: ${account.leggings.name}\nStivali: ${account.boots.name}\nArma: ${account.weapon.name}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: opts.reply_markup
                });
            })
            .catch(error => {
                console.log('Errore durante il recupero dell\'account:', error);
                bot.editMessageText('Si è verificato un errore durante il recupero dell\'account. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
    } else if (data.startsWith("equip_")) {
        const equipment = data.split("_")[1];
        getCachedAccount(userId.toString())
            .then(account => {

                const equipDefault = account[equipment]
                const equips = account.items.filter(i => i.effect === equipment.toUpperCase());

                if (equipDefault.name != defaultEquipment[equipment].name) {
                    equips.push({
                        ...defaultEquipment[equipment],
                        equip: false
                    });
                }



                const equipArray = equipDefault ? [account[equipment], ...equips] : equips;


                bot.editMessageText(`Seleziona l'oggetto da equipaggiare come ${equipment}:`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: JSON.stringify({
                        inline_keyboard: equipArray.map(i => [{
                            text: i.equip === true ? `✅ ${i.name}` : i.name,
                            callback_data: i.equip === true ? `already_equipped_${i.name}` : `equipaction_${equipment}_${i.name}`
                        }]).concat([[{ text: 'Torna all\'inventario', callback_data: 'inventory' }]])
                    })
                });
            }
            )
            .catch(error => {
                console.log('Errore durante il recupero dell\'account:', error);
                bot.editMessageText('Si è verificato un errore durante il recupero dell\'account. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });



            })
            .catch(error => {
                console.log('Errore durante il recupero dell\'account:', error);
                bot.editMessageText('Si è verificato un errore durante il recupero dell\'account. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
    } else if (data.startsWith("equipaction_")) {
        const equipment = data.split("_")[1];
        const itemName = data.split("_")[2];
        getCachedAccount(userId.toString())
            .then(account => {
                let item = account.items.find(i => i.name === itemName);
                if (!item) {
                    item = defaultEquipment[equipment];
                }
                const oldEquipment = account[equipment];
                let newEquipment = {};
                if ('attack' in item) {
                    newEquipment = { name: item.name, attack: item.attack, equip: true, effect: item.effect, ...(item.price && { price: item.price }) };
                } else if ('defense' in item) {
                    newEquipment = { name: item.name, defense: item.defense, equip: true, effect: item.effect, ...(item.price && { price: item.price }) };
                }

                const newItems = account.items.filter(i => i.name !== itemName);
                if (oldEquipment.name != defaultEquipment[equipment].name) {
                    oldEquipment.equip = false;
                    newItems.push(oldEquipment);
                }

                updateDoc(doc(database, `users/${account.id}`), {
                    [equipment]: newEquipment,
                    items: newItems
                })
                    .then(() => {
                        invalidateCache(userId.toString());
                        bot.editMessageText(`Hai equipaggiato ${itemName} come ${equipment}!`, {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: optsBackToMain.reply_markup
                        });
                    })
                    .catch(error => {
                        console.log('Errore durante l\'equipaggiamento dell\'oggetto:', error);
                        bot.editMessageText('Si è verificato un errore durante l\'equipaggiamento dell\'oggetto. Si prega di riprovare più tardi.', {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: optsBackToMain.reply_markup
                        });
                    });
            })
            .catch(error => {
                console.log('Errore durante il recupero dell\'account:', error);
                bot.editMessageText('Si è verificato un errore durante il recupero dell\'account. Si prega di riprovare più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
    } else if (data.startsWith("already_equipped_")) {
        const itemName = data.split("_")[2];
        bot.answerCallbackQuery(callbackQuery.id, {
            text: `⚠️ L'oggetto "${itemName}" è già equipaggiato!`,
            show_alert: true
        });
    }
    else if (data === 'adventure') {
        getCachedAccount(userId.toString()).then(account => {

            getDocs(collection(database, 'adventures')).then(querySnapshot => {
                let inlineKeyboard = [];

                querySnapshot.forEach(doc => {
                    const world = doc.data();
                    const isAccessible = account.level >= world.requiredLevel;


                    inlineKeyboard.push([{
                        text: `${isAccessible ? '✅' : '❌'} ${world.place} (Livello: ${world.requiredLevel})`,
                        callback_data: isAccessible ? `enter_world_${doc.id}` : 'locked_world'
                    }]);
                });


                inlineKeyboard.push([{ text: 'Torna al menu principale', callback_data: 'back_to_main' }]);


                bot.editMessageText('Benvenuto nelle avventure! Scegli il luogo dove vuoi andare:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: JSON.stringify({
                        inline_keyboard: inlineKeyboard
                    })
                });
            }).catch(error => {
                console.error('Errore nel recupero dei mondi:', error);
                bot.editMessageText('Si è verificato un errore durante il caricamento delle avventure. Riprova più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
        }).catch(error => {
            console.error('Errore nel recupero dell\'account:', error);
            bot.editMessageText('Si è verificato un errore durante il caricamento del tuo account. Riprova più tardi.', {
                chat_id: chatId,
                message_id: messageId
            });
        });
    }
    else if (data === 'locked_world') {
        bot.answerCallbackQuery(callbackQuery.id, {
            text: "Non hai il livello richiesto per accedere a questo mondo.",
            show_alert: true
        });
    }
    else if (data.startsWith('enter_world_')) {
        const worldId = data.split('_')[2];
        getCachedAccount(userId.toString()).then(account => {
            getDoc(doc(database, `adventures/${worldId}`)).then(world => {
                world = world.data();
                const monster = generateMonster(world);
                const monsterLevel = generateMonsterLevel(account.level);
                bot.editMessageText(`Sei entrato nel mondo di ${world.place}! Ti sei imbattuto in un ${monster.name} di livello ${monsterLevel}!`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: JSON.stringify({
                        inline_keyboard: [[{
                            text: 'Combatti!',
                            callback_data: `fight_${worldId}_${monster.name}_${monsterLevel}`
                        }, {
                            text: 'Fuggi!',
                            callback_data: `flee_${worldId}_${monster.name}_${monsterLevel}`
                        }]]
                    })
                });

            }).catch(error => {
                console.error('Errore nel recupero del mondo:', error);
                bot.editMessageText('Si è verificato un errore durante il caricamento del mondo. Riprova più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
        }).catch(error => {
            console.error('Errore nel recupero dell\'account:', error);
            bot.editMessageText('Si è verificato un errore durante il caricamento del tuo account. Riprova più tardi.', {
                chat_id: chatId,
                message_id: messageId
            });
        });
    } else if (data.startsWith('flee_')) {
        const worldId = data.split('_')[1];
        const monsterName = data.split('_')[2];
        const monsterLevel = data.split('_')[3];
        getCachedAccount(userId.toString()).then(account => {
            const coins = account.coins;
            let newCoinBalance = 0;


            if (coins === 0) {
                bot.editMessageText(`Sei fuggito dal mostro ${monsterName} (Livello ${monsterLevel}). Senza gloria e senza monete!`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{
                                text: 'Torna alle avventure',
                                callback_data: 'adventure'
                            }]
                        ]
                    })
                });
                return;
            }

            if (coins < 5) {
                newCoinBalance = 0;
            } else {

                newCoinBalance = coins - 5;
            }

            updateDoc(doc(database, `users/${account.id}`), {
                coins: newCoinBalance
            }).then(() => {
                getDoc(doc(database, `adventures/${worldId}`)).then(world => {
                    world = world.data();

                    invalidateCache(userId.toString());
                    let lossMessage = coins < 5 ? `Hai perso tutte le tue monete!` : `Hai perso 5 monete!`;
                    bot.editMessageText(`Sei fuggito dal mostro ${monsterName} (Livello ${monsterLevel}). ${lossMessage}`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [{
                                    text: 'Torna alle avventure',
                                    callback_data: 'adventure'
                                }]
                            ]
                        })
                    });
                }).catch(error => {
                    console.error('Errore nel recupero del mondo:', error);
                    bot.editMessageText('Si è verificato un errore durante il caricamento del mondo. Riprova più tardi.', {
                        chat_id: chatId,
                        message_id: messageId
                    });
                });
            }).catch(error => {
                console.error('Errore nell\'aggiornamento del saldo monete:', error);
                bot.editMessageText('Si è verificato un errore durante l\'aggiornamento delle tue monete. Riprova più tardi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            });
        }).catch(error => {
            console.error('Errore nel recupero dell\'account:', error);
            bot.editMessageText('Si è verificato un errore durante il caricamento del tuo account. Riprova più tardi.', {
                chat_id: chatId,
                message_id: messageId
            });
        });
    } else if (data.startsWith('fight_')) {
        const [_, worldId, monsterName, monsterLevel] = data.split('_');


        getCachedAccount(userId.toString()).then(account => {

            getDoc(doc(database, `adventures/${worldId}`)).then(worldDoc => {
                const world = worldDoc.data();
                const monster = world.mobs.find(mob => mob.name === monsterName);

                const userHp = account.hp;
                const monsterHp = monster.hp;


                bot.editMessageText(
                    `Inizia il combattimento contro ${monster.name}!\n\n👤 *Tu*: ${userHp} HP\n🐉 *${monster.name}*: ${monsterHp} HP Livello ${monsterLevel}`,
                    {
                        parse_mode: "Markdown",
                        chat_id: chatId,
                        message_id: messageId,
                    }
                ).then(sentMessage => {
                    setTimeout(() => {
                        executeFightCycle(userId, worldId, monsterName, sentMessage.message_id, monsterLevel, sentMessage.chat.id);
                    }, 3000);
                    
                }).catch(error => {
                    console.error("Errore durante l'edit del messaggio:", error);
                });

            }).catch(error => {
                console.error("Errore durante il recupero del mondo:", error);
                bot.sendMessage(chatId, "Errore nel caricamento del mondo. Riprova più tardi.");
            });

        }).catch(error => {
            console.error("Errore durante il recupero dell'account:", error);
            bot.sendMessage(chatId, "Errore nel caricamento del tuo account. Riprova più tardi.");
        });
    }
});

function createAccount(telegramUserId, telegramUsername) {
    return new Promise((resolve, reject) => {
        addDoc(collection(database, 'users'), {
            userId: telegramUserId,
            username: telegramUsername,
            level: 1,
            xp: 0,
            xpTop: 100,
            coins: 0,
            dailyBonus: new Date(),
            items: [{ name: "Mutande", price: 0 }],
            hp: 100,
            attack: 1,
            defense: 1,
            ...defaultEquipment
        })
            .then(() => {
                console.log('Account creato con successo per', telegramUsername);
                resolve();
            })
            .catch(error => {
                console.log('Errore durante la creazione dell\'account:', error);
                reject(error);
            });
    });
}

function getAccount(telegramUserId) {
    return new Promise((resolve, reject) => {
        const usersCollection = collection(database, 'users');
        const queryUser = query(usersCollection, where('userId', '==', telegramUserId));
        getDocs(queryUser)
            .then(querySnapshot => {
                let accountData = null;
                querySnapshot.forEach(doc => {
                    accountData = { id: doc.id, ...doc.data() };
                });
                resolve(accountData);
            })
            .catch(error => {
                console.log('Errore durante il recupero dell\'account:', error);
                reject(error);
            });
    });
}

function checkDailyBonus(telegramUserId) {
    return new Promise((resolve, reject) => {
        getAccount(telegramUserId)
            .then(account => {
                const dailyBonus = new Date(account.dailyBonus.seconds * 1000);
                dailyBonus.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (today >= dailyBonus) {
                    console.log("Puoi ritirare il bonus giornaliero");
                    resolve(true);
                } else {
                    console.log("Non puoi ritirare il bonus giornaliero");
                    resolve(false);
                }
            })
            .catch(error => {
                console.log('Errore durante il controllo del bonus giornaliero:', error);
                reject(error);
            });
    });


}

function generateMonster(world) {

    const rarities = Object.keys(raritySpawnChance);


    const totalWeight = rarities.reduce((sum, rarity) => sum + raritySpawnChance[rarity], 0);

    while (true) {

        const randomValue = Math.random() * totalWeight;


        let selectedRarity;
        let cumulativeWeight = 0;

        for (const rarity of rarities) {
            cumulativeWeight += raritySpawnChance[rarity];
            if (randomValue < cumulativeWeight) {
                selectedRarity = rarity;
                break;
            }
        }


        const filteredMonsters = world.mobs.filter(monster => monster.rarity === selectedRarity);


        if (filteredMonsters.length > 0) {
            const monster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
            console.log(monster);
            return monster;
        }


    }
}


function executeFightCycle(userId, worldId, monsterName, messageId, monsterLevel, chatId) {
    getCachedAccount(userId.toString()).then(account => {
        getDoc(doc(database, `adventures/${worldId}`)).then(worldDoc => {
            const world = worldDoc.data();
            const monster = world.mobs.find(mob => mob.name === monsterName);

            let monsterLevelNumber = parseInt(monsterLevel);
            let monsterHp = parseInt(monster.hp) + (monsterLevelNumber * 10);
            let userHp = account.hp;
            let userLevel = account.level;
            const userAttack = calculateAttack(account);
            const userDefense = calculateDefense(account);
            const monsterAttack = monster.attack + (monsterLevelNumber * 10);
            const monsterDefense = monster.defense + (monsterLevelNumber * 10);

            const chatIdActive = chatId || userId; 
            
            let turns = 0;
            let totalDamageDealt = 0;
            let totalDamageTaken = 0;

        
            while (monsterHp > 0 && userHp > 0) {
                
                const playerDamage = calculateDamage(userAttack, monsterDefense, userLevel);
                monsterHp -= playerDamage;
                totalDamageDealt += playerDamage;

                if (monsterHp > 0) {
                    const monsterDamage = calculateDamage(monsterAttack, userDefense, userLevel);
                    userHp -= monsterDamage;
                    totalDamageTaken += monsterDamage;
                }

                turns++;
            }

            const isVictory = monsterHp <= 0;
            const battleSummary = `⚔️ *Combattimento contro ${monster.name}* (Livello ${monsterLevel})\n\n` +
            `📊 *Riepilogo*\n` +
            `- Turni: ${turns}\n` +
            `- Danni inflitti: ${totalDamageDealt}\n` +
            `- Danni subiti: ${totalDamageTaken}\n\n` +
            `${isVictory ? "🎉 Hai vinto la battaglia!" : "💀 Sei stato sconfitto!"}`;

            if (isVictory) {
                handleVictory(userId, messageId, monster, account, monsterLevel, chatIdActive, battleSummary);
            } else {
                handleDefeat(userId, messageId, monster, monsterLevel, chatIdActive, battleSummary);
            }

            


        }).catch(error => {
            console.error('Errore nel recupero del mondo:', error);
            bot.sendMessage(userId, '❌ Si è verificato un errore durante il caricamento del mondo. Riprova più tardi.');
        });
    }).catch(error => {
        console.error('Errore nel recupero dell\'account:', error);
        bot.sendMessage(userId, '❌ Si è verificato un errore durante il caricamento del tuo account. Riprova più tardi.');
    });
}

function calculateDamage(attack, defense, levelBonus = 0) {
    const effectiveAttack = attack + levelBonus;
    return Math.max(1, Math.floor(effectiveAttack * (effectiveAttack / (effectiveAttack + defense))));
}

function calculateAttack(account) {
    return account.attack + account.weapon.attack;
}

function calculateDefense(account) {
    return account.defense + account.helmet.defense + account.chestplate.defense + account.leggings.defense + account.boots.defense;
}

function handleVictory(userId, messageId, monster, account, monsterLevel, chatIdActive, battleSummary) {
    const xpGain = calculateXpGain(account.level, monster, monsterLevel);
    const drops = calculateDrops(monster.drops);

    bot.editMessageText( `${battleSummary}\n\n` +
        `🎉 Hai sconfitto *${monster.name}*!\n` +
        `🏆 XP guadagnata: ${xpGain}\n` +
        `🎁 Oggetti ottenuti: ${drops.map(d => d.name).join(', ') || "Nessuno"}`, {
        chat_id: chatIdActive,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: optsBackToMain.reply_markup
    });


    let totalXp = (account.xp || 0) + xpGain;
    let newLevel = account.level;
    let newXpTop = account.xpTop;
    let newAttack = account.attack;
    let newDefense = account.defense;
    let newHp = account.hp;


    while (totalXp >= newXpTop) {
        totalXp -= newXpTop;
        newAttack++;
        newDefense++;
        newHp += 10;
        newLevel++;
        newXpTop *= 2;
    }


    updateDoc(doc(database, `users/${account.id}`), {
        xp: totalXp,
        attack: newAttack,
        defense: newDefense,
        hp: newHp,
        level: newLevel,
        xpTop: newXpTop,
        items: [...account.items, ...drops],
    })
        .then(() => {
            if (newLevel > account.level) {
                bot.sendMessage(chatIdActive, `🎉 Complimenti ${account.username}! Sei salito al livello ${newLevel}!`);
            }
            console.log(`Aggiornato utente ${account.id}: Livello ${newLevel}, XP ${totalXp}/${newXpTop}`);
            invalidateCache(userId.toString());
        })
        .catch(error => {
            console.error("Errore durante l'aggiornamento dell'account:", error);
        });
}

function calculateXpGain(playerLevel, monster, monsterLevel) {
    monsterLevel = parseInt(monsterLevel);
    const levelDifference = Math.max(0, monsterLevel - playerLevel);
    const baseXp = monster.baseXp;
    const bonusFactor = 10;

    const xpGain = baseXp + (levelDifference * bonusFactor);
    return Math.max(0, xpGain * rarityMultiplier[monster.rarity]);
}

function generateMonsterLevel(playerLevel) {
    const level = playerLevel + Math.floor(Math.random() * 5) + 1;
    return level;
}


function calculateDrops(dropsArray) {
    const loot = [];
    dropsArray.forEach(drop => {
        const chance = Math.random() * 100;
        if (chance < (101 - drop.rarity)) {
            loot.push(drop);
        }
    });
    return loot;
}

function handleDefeat(userId, messageId, monster, monsterLevel, chatIdActive, battleSummary) {
    bot.editMessageText(
        `${battleSummary}\n\n` +
        `💀 Sei stato sconfitto da *${monster.name} (Livello ${monsterLevel})*!\n` +
        `Prova a potenziarti e riprova la prossima volta.`,
        {
            chat_id: chatIdActive,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: optsBackToMain.reply_markup
        }
    );
}


async function getCachedAccount(userId) {
    if (userAccountCache[userId]) {
        return Promise.resolve(userAccountCache[userId]);
    } else {
        const account = await getAccount(userId);
        userAccountCache[userId] = account;
        return account;
    }
}

function invalidateCache(userId) {
    delete userAccountCache[userId];
}

function paginateItems(items, page) {
    const start = (page - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return items.slice(start, end);
}

function createPaginationButtons(currentPage, totalPages) {
    const buttons = [];
    if (currentPage > 1) {
        buttons.push({ text: '⬅️ Precedente', callback_data: `items_page_${currentPage - 1}` });
    }
    if (currentPage < totalPages) {
        buttons.push({ text: '➡️ Successivo', callback_data: `items_page_${currentPage + 1}` });
    }
    return buttons;
}

function handleItemsCommand(chatId, messageId, userId, page = 1) {
    getCachedAccount(userId.toString())
        .then(account => {
            const { items } = account;
            if (!items || items.length === 0) {
                return bot.editMessageText('Non hai oggetti.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: optsBackToMain.reply_markup
                });
            }

            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
            const paginatedItems = paginateItems(items, page);
            const itemsList = paginatedItems.map(item => `Nome: ${item.name}\nValore: ${item.price}\n\n`).join('');
            const message = `I tuoi oggetti (Pagina ${page} di ${totalPages}):\n\n${itemsList}`;

            const paginationButtons = createPaginationButtons(page, totalPages);
            const replyMarkup = JSON.parse(optsBackToMain.reply_markup);
            replyMarkup.inline_keyboard = [paginationButtons, ...replyMarkup.inline_keyboard];

            bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: replyMarkup
            });
        })
        .catch(error => {
            console.log('Errore durante il recupero degli oggetti:', error);
            bot.editMessageText('Si è verificato un errore durante il recupero degli oggetti. Si prega di riprovare più tardi.', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: optsBackToMain.reply_markup
            });
        });;



}

async function createAdventure(adventureData) {
    try {
      const docRef = await addDoc(collection(database, "adventures"), adventureData);
      console.log("Avventura creata con ID:", docRef.id);
    } catch (e) {
      console.error("Errore nell'inserire l'avventura nel database: ", e);
    }
  }