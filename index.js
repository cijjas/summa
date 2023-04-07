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
const {Configuration, OpenAIApi} = require("openai");
require("dotenv").config();

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
const configuration = new Configuration({
    apiKey : process.env.OPENAI_API_KEY,
});

async function runCompletion(message, speciality){
    try {
        // send question to open ai
        const messages = [
            {
                role: "assistant",
                content: speciality
            },
            {
                role: "user",
                content: message   
            }
        ]
        const data = {
            model: "gpt-3.5-turbo",
            messages,
        }
        let res = await fetch("https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify(data)
            })

        res = await res.json()
        if(res.error){
            console.error(res)
        }

        return res.choices[0].message.content.trim();
        

    } catch (error) {
        console.log(`ERR: ${error}`);
    }
    
}
async function createSummaryPIPE( msg, amount){
    const chat = await msg.getChat();
    try{
        const fetch = await chat.fetchMessages({ limits: amount, fromMe: undefined});
        const reply = fetch.map(message => message.body).join('\n');
        return reply;
    }
    catch(err){
        console.log('create PIPE ERR: ' + err);
    }
    
}
async function saveMessagesSUMMA(msg){
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    try{
        const groupName = chat.name;
        const message = {
            from: contact.pushname,
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
    }
    catch(err){
        console.log('save SUMMA ERR: ' + err);
    }
}

async function sendPrivateMessage(contact, message) {
    try {
      const chat = await client.getChatById(contact);
      await chat.sendMessage(message);
    } catch (error) {
      console.error(error);
    }
  }
  
async function createSummarySUMMA(msg){
    const chat = await msg.getChat();
    try{
        createMeSummarySUMMA(msg, chat.name);
    }
    catch(err){
        console.log('createSUMMA ERR: ' + err);
    }
    
}
async function createMeSummarySUMMA(msg, groupName){ 
    try{
        const sender = await msg.getContact();
        const senderId = sender.id._serialized;

        const chatMessages = messages[groupName];
        if (chatMessages) {

            const gptPre = 'Quiero que resumas la conversación que pongo a continuación manteniendo quien dijo que y que no se repitan las frases, mantenelo bien corto, menos de 100 palabras salteate detalles irrelevantes. También conta la cantidad de veces que alguien mandó mensajes por nombre de la gente que aprece asi "[nombre]" Y en un pequeño parrafo aparte poneme quien la cantidad de mensajes que mandó cada uno así y su humor así: [nombre] - numero de mensajes {humor}:\n';
            const chatLog = chatMessages.map(message => '[' + message.from +']' + ': ' + message.text).join('\n');
            //runCompletion(gptSum + chatLog, "Sos un asistente que resumen conversaciones.").then(result => msg.contact.sendMessage(result));
            
            runCompletion(gptPre + chatLog, "Sos un asistente que resumen conversaciones.").then(result => sendPrivateMessage(senderId, result));      
        }
    }
    catch(err){
        console.log('createSUMMA ERR: ' + err);
    }
}

client.on('message_create', async msg => {
   
    if(msg.fromMe) {
        const contact = await msg.getContact();
        const chat  = await msg.getChat();
        const msgTo = chat.name;
        const contactPushName = contact.pushname;
        const contactNumber = contact.number;
        console.log('\x1b[90m{'+ `\x1b[31m[${contactNumber} : \x1b[34m${contactPushName}\x1b[31m]`+ `\x1b[90m --to-->` + ` \x1b[36m${msgTo}\x1b[31m `+`\x1b[90m:`+` \x1b[32m${msg.body}\x1b[31m`+'\x1b[90m}');


        
        

        const [firstWord, restOfStr] = getFirstWord(msg.body);
        if(firstWord === 'resumime' || firstWord === 'Resumime'){
            const groupName = restOfStr;
            if(groupName){
                createMeSummarySUMMA(msg, groupName);
            }

        }
        if(firstWord === 'gpt:' && chatIsAppropiate(msg)){
            runCompletion(restOfStr, "Sos un asistente que responde con simpleza y es muy inteligente").then(result => msg.reply(result));      
        }
        if(chat.isGroup && msg.body !== 'Summa'){
            await saveMessagesSUMMA(msg);
        }
        else if(msg.body === 'summa' || msg.body === 'Summa'){
            msg.react('👍');
            await createSummarySUMMA(msg);
        }
        if(msg.body === 'pipe' || msg.body === 'Pipe' && chatIsAppropiate(msg)){
            msg.react('👍');
            const reply = await createSummaryPIPE(msg, 10);
            msg.reply(reply);
        }
    }

});
function getFirstWord(str) {
    const words = str.split(" ");
    const firstWord = words[0];
    const restOfStr = words.slice(1).join(" ");
    return [firstWord, restOfStr];
  }
client.on('message', async msg => {
    if(!chatIsAppropiate(msg)){
        return;
    }
    const contact = await msg.getContact();
    const chat  = await msg.getChat();
    const msgTo = chat.name;
    const contactPushName = contact.pushname;
    const contactNumber = contact.number;
    console.log('\x1b[90m{'+ `\x1b[31m[${contactNumber} : \x1b[34m${contactPushName}\x1b[31m]`+ `\x1b[90m --to-->` + ` \x1b[36m${msgTo}\x1b[31m `+`\x1b[90m:`+` \x1b[32m${msg.body}\x1b[31m`+'\x1b[90m}');

    
    /*
    const [firstWord, restOfStr] = getFirstWord(msg.body);
    if(firstWord === 'gpt:' && chatIsAppropiate(msg)){
        runCompletion(restOfStr, "Sos un asistente que responde con simpleza y es muy inteligente").then(result => msg.reply(result));      
    }*/

    if(chat.isGroup && msg.body.toLowerCase() !== 'summa' ) {
        await saveMessagesSUMMA(msg);
    }
    if (msg.body.toLowerCase() === 'summa') {  
        msg.react('👍');
        await createSummarySUMMA(msg);
    }
    else if (msg.body.toLowerCase() === 'pipe' && chatIsAppropiate(msg)  ) {       // https://docs.wwebjs.dev/Chat.html 
        msg.react('👍');
        const reply = await createSummaryPIPE(msg, 10);
        msg.reply(reply);
    }
   

});

function chatIsAppropiate(message){
    const chat = message.getChat();
     return !(chat.isGroup && (chat.name === 'BD I' || chat.name === 'Inge Soft I' || chat.name === 'SO' || chat.name === 'HCI' || chat.name === 'Photo Dump Elite Elite'));
}
client.initialize();
