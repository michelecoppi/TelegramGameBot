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

const rarityMultiplier = {
    "Common": 1.0,
    "Uncommon": 1.2,
    "Rare": 1.5,
    "Epic": 2.0
};

const optsBackToMain = {
    reply_markup: JSON.stringify({
        inline_keyboard: [[{
            text: 'Back',
            callback_data: 'back_to_main'
        }]]
    })
};

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
                bot.sendMessage(chatId, `Bentornato ${account.username}!\nLivello: ${account.level}\nCoins: ${account.coins}`, opts)
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
    } else if (data === 'shop') {
        let shopItems = [];
        getDocs(collection(database, 'items'))
            .then(querySnapshot => {
                querySnapshot.forEach(doc => {
                    shopItems.push({ id: doc.id, ...doc.data() });
                });

                let items = [];
                for (let i = 0; i < shopItems.length; i++) {
                    let item = shopItems[i];
                    items.push([{
                        text: `Acquista ${item.name} per ${item.price} coins`,
                        callback_data: `buy_${item.id}`
                    }]);
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
                    reply_markup: optsBackToMain.reply_markup
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
                                items: [...account.items, { name: shopItem.name, price: shopItem.price }]
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
                                message_id: messageId
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
                bot.editMessageText(`Bentronato ${account.username}!\n Livello: ${account.level}\n Coins: ${account.coins}`, {
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
                            [{ text: `${account.helmet.name}`, callback_data: 'helmet' }],
                            [{ text: `${account.chestplate.name}`, callback_data: 'chestplate' }],
                            [{ text: `${account.leggings.name}`, callback_data: 'leggings' }],
                            [{ text: `${account.boots.name}`, callback_data: 'boots' }],
                            [{ text: `${account.weapon.name}`, callback_data: 'weapon' }],
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
    } else if (data === 'adventure') {
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
                    executeFightCycle(userId, worldId, monsterName, sentMessage.message_id, monsterLevel, sentMessage.chat.id);
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
            helmet: { name: "Nessun elmo", defense: 0 },
            chestplate: { name: "Nessuna corazza", defense: 0 },
            leggings: { name: "Nessun pantalone", defense: 0 },
            boots: { name: "Nessun stivale", defense: 0 },
            weapon: { name: "Pugno", attack: 5 },
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
   
    const rarities = Object.keys(rarityMultiplier);

    
    const totalWeight = rarities.reduce((sum, rarity) => sum + rarityMultiplier[rarity], 0);

    while (true) {
       
        const randomValue = Math.random() * totalWeight;

       
        let selectedRarity;
        let cumulativeWeight = 0;

        for (const rarity of rarities) {
            cumulativeWeight += rarityMultiplier[rarity];
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

            // Inizializza variabili del combattimento
            let monsterHp = parseInt(monster.hp);
            const monsterAttack = monster.attack;
            const monsterDefense = monster.defense;

            let userHp = account.hp;
            const userAttack = calculateAttack(account);
            const userDefense = calculateDefense(account);

            const chatIdActive = chatId === undefined ? userId : chatId;


            fightTurn();

            function fightTurn() {
                if (monsterHp <= 0) {
                    handleVictory(userId, messageId, monster, account, monsterLevel, chatIdActive);
                    return;
                }

                if (userHp <= 0) {
                    handleDefeat(userId, messageId, monster, monsterLevel, chatIdActive);
                    return;
                }


                const playerDamage = Math.max(0, userAttack - monsterDefense);
                monsterHp -= playerDamage;


                if (monsterHp > 0) {
                    const monsterDamage = Math.max(0, monsterAttack - userDefense);
                    userHp -= monsterDamage;
                }
                

                bot.editMessageText(`⚔️ Combattimento contro *${monster.name}*!\n\n👤 *Tu*: ${userHp} HP\n🐉 *${monster.name} (Livello ${monsterLevel})*: ${monsterHp} HP\n\n👊 Hai inflitto ${playerDamage} danni.\n🔥 ${monster.name} ti ha inflitto ${monsterHp > 0 ? monsterAttack - userDefense : 0} danni.`, {
                    chat_id: chatIdActive,
                    message_id: messageId,
                    parse_mode: "Markdown",
                }).then(() => {

                    setTimeout(fightTurn, 2000);
                }).catch(error => {
                    console.error("Errore durante l'editing del messaggio:", error);
                });
            }
        }).catch(error => {
            console.error('Errore nel recupero del mondo:', error);
            bot.sendMessage(userId, 'Si è verificato un errore durante il caricamento del mondo. Riprova più tardi.');
        });
    }).catch(error => {
        console.error('Errore nel recupero dell\'account:', error);
        bot.sendMessage(userId, 'Si è verificato un errore durante il caricamento del tuo account. Riprova più tardi.');
    });
}

function calculateAttack(account) {
    return account.attack + account.weapon.attack;
}

function calculateDefense(account) {
    return account.defense + account.helmet.defense + account.chestplate.defense + account.leggings.defense + account.boots.defense;
}

function handleVictory(userId, messageId, monster, account, monsterLevel, chatIdActive) {
    const xpGain = calculateXpGain(account.level, monster, monsterLevel); 
    const drops = calculateDrops(monster.drops);

    bot.editMessageText(`🎉 Hai sconfitto *${monster.name} (Level ${monsterLevel})*!\n\n🏆 XP guadagnata: ${xpGain}\n🎁 Oggetti ottenuti: ${drops.map(d => d.name).join(', ') || "Nessuno"}`, {
        chat_id: chatIdActive,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: optsBackToMain.reply_markup
    });

    
    let totalXp = (account.xp || 0) + xpGain;
    let newLevel = account.level;
    let newXpTop = account.xpTop;


    while (totalXp >= newXpTop) {
        totalXp -= newXpTop; 
        newLevel++; 
        newXpTop *= 2; 
    }

    
    updateDoc(doc(database, `users/${account.id}`), {
        xp: totalXp,
        level: newLevel,
        xpTop: newXpTop,
        items: [...account.items, ...drops],
    })
        .then(() => {
            bot.sendMessage(chatIdActive, `🎉 Complimenti ${account.name}! Sei salito al livello ${newLevel}!`);
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
        if (chance < drop.rarity) {
            loot.push(drop);
        }
    });
    return loot;
}

function handleDefeat(userId, messageId, monster, monsterLevel, chatIdActive) {
    bot.editMessageText(`💀 Sei stato sconfitto da *${monster.name} (Livello ${monsterLevel})*!\nProva a potenziarti e riprova la prossima volta.`, {
        chat_id: chatIdActive,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: optsBackToMain.reply_markup
    });
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
