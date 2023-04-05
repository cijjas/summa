'use strict';

const Constants = require('./src/util/Constants');

module.exports = {
    Client: require('./src/Client'),
    
    version: require('./package.json').version,

    // Structures
    Chat: require('./src/structures/Chat'),
    PrivateChat: require('./src/structures/PrivateChat'),
    GroupChat: require('./src/structures/GroupChat'),
    Message: require('./src/structures/Message'),
    MessageMedia: require('./src/structures/MessageMedia'),
    Contact: require('./src/structures/Contact'),
    PrivateContact: require('./src/structures/PrivateContact'),
    BusinessContact: require('./src/structures/BusinessContact'),
    ClientInfo: require('./src/structures/ClientInfo'),
    Location: require('./src/structures/Location'),
    ProductMetadata: require('./src/structures/ProductMetadata'),
    List: require('./src/structures/List'),
    Buttons: require('./src/structures/Buttons'),
    
    // Auth Strategies
    NoAuth: require('./src/authStrategies/NoAuth'),
    LocalAuth: require('./src/authStrategies/LocalAuth'),
    RemoteAuth: require('./src/authStrategies/RemoteAuth'),
    LegacySessionAuth: require('./src/authStrategies/LegacySessionAuth'),
    
    ...Constants
};

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

const messages = {};

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async msg => {
    const chat  = await msg.getChat();
    const contact = await msg.getContact();
    const msgTo = chat.name;
    const contactId = contact.id._serialized;
    console.log(contactId + ' to ['+ msgTo + ']: ' + msg.body);


    const brufarNumber = "5491127267164@c.us";
    const brufarContact = await client.getContactById(brufarNumber);
    if(chat.isGroup && msg.body.toLowerCase() === 'callate brufar') {
        console.log('removing brufar')
        chat.removeParticipants([brufarContact]);
        msg.reply('a casa brufar');    
    }  
    if(chat.isGroup && msg.body.toLowerCase() === 'volve brufar') {
        chat.addParticipants([brufarContact]);
    }    
    if(chat.isGroup) {
        const groupName = chat.name;
        const message = {
            from: contact.name,
            text: msg.body,
            timestamp: Date.now()
        };
        if (!messages[groupName]) {
            messages[groupName] = [message];
        } else {
            messages[groupName].push(message);
            if (messages[groupName].length > 200) {
                messages[groupName].shift();
            }
        }
    } else {
        console.log('Received message from', chat.name);
    }
    if (msg.body.toLowerCase() === 'summa') {        
        const groupName = chat.name;
        const chatMessages = messages[groupName];
        if (chatMessages) {
            const reply = chatMessages.map(message => message.from + ':' + message.text).join('\n');
            msg.reply(reply);
        }
    }
});

client.initialize();
