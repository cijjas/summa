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

const dotenv =require("dotenv").config();
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const {Configuration, OpenAIApi} = require("openai");
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const util = require('util');
const wav = require("node-wav");
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');

//const process = require('node:process');



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// mapa de grupos y mensajes
const messages = {};
// Header that the reply message will have, following by the transcription
const responseMsgHeader = "This is an automatic transcription of the voice message:"
const responseMsgHeaderError = "An error ocurred with the automatic transcription of the voice message."

const configuration = new Configuration({
    apiKey : process.env.OPENAI_API_KEY,
});
const api = new OpenAIApi(configuration);
const apiHost = configuration.apiKey;
const client = new Client({
    authStrategy: new LocalAuth(),
});

/**
 * funcione que genera el qr para escanaear con el celular. El celular que se usa va a ser el BOT
*/
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

/**
 * funcion que se ejecuta cuando el cliente se conecta a whatsapp (Cuando el bot se prende)
*/
client.on('ready', () => {
    console.log('Client is ready!');
});

//----------------------------------------------------------------------------------------------------------------------------------
//OPEN AI SPEECH TO TEXT
/*
const filePath = path.join(__dirname, "spToTe.mp3");
const model = 'whisper-1';

const formData = new FormData();
formData.append("model", model);
formData.append("file", fs.createReadStream(filePath));

axios.post("https://api.openai.com/v1/audio/transcriptions", formData,{
    headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": `multipart/form-data; boundry=${formData._boundary}`,
    }
})
.then((response) => {
    console.log(response.data);
})*/
//----------------------------------------------------------------------------------------------------------------------------------

// This function handles the missing media in the chat by retrieving messages from the chat until the media is available
async function downloadQuotedMedia(quotedMsg, messageId, chat, maxRetries = 5) {
	let attachmentData = null;
	let counter = 10;
  
	while (!attachmentData && counter <= maxRetries) {
	  try {
		const quotedMsgArr = await chat.fetchMessages({ limit: counter });
		for (let i = 0; i < quotedMsgArr.length; i++) {
		  if (quotedMsgArr[i].id._serialized === messageId) {
			attachmentData = await quotedMsg.downloadMedia();
			break;
		  }
		}
	  } catch (err) {
		console.log(`Error fetching messages. Retrying in 5 seconds... (attempt ${counter}/${maxRetries})`);
		await new Promise(resolve => setTimeout(resolve, 5000));
	  }
  
	  counter++;
	}
	if (!attachmentData) {
	  console.log(`Could not download quoted media after ${maxRetries} attempts.`);
	}
  
	return attachmentData;

}

async function SpeechToTextTranscript(base64String, message) {
    const binaryString = Buffer.from(base64String, 'base64').toString('binary');

    // Extract PCM data from binary string
    const pcmData = Buffer.from(binaryString, 'binary');
    fs.writeFile('output.ogg', pcmData, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });

    const inputFile = 'output.ogg';

    const outputFile = 'audio.mp3';

    const command2 = `ffmpeg -i "${inputFile}" -acodec libmp3lame "${outputFile}"`;
    const command = `ffmpeg -i "${inputFile}" "${outputFile}"`;

    // Execute FFmpeg command
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error during conversion: ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`FFmpeg stderr: ${stderr}`);
        return;
      }
      console.log('Conversion complete');
    });


    
}


async function dealWithAudio(message){

    const chat = await message.getChat();

    // Here we check if the message has a quoted message
	if((message.body == 'Texto' || message.body == 'texto') && message.hasQuotedMsg){
		const quotedMsg = await message.getQuotedMessage();
		const messageId = quotedMsg.id._serialized	

		// Here we check if the message has media
		if (quotedMsg.hasMedia) {
			// If is a voice message, we download it and send it to the api
			if (quotedMsg.type.includes("ptt") || quotedMsg.type.includes("audio")) {
                const maxRetries = 1000;
				const attachmentData = await downloadQuotedMedia(quotedMsg, messageId, chat, maxRetries);
				if (attachmentData) {
					SpeechToTextTranscript(attachmentData.data, message)
					.then((body) => {
						console.log(body); // Handle the returned data here
						const data = JSON.parse(body);
						for (const result of data.results) {
							const transcript = result.transcript;
							
							chat.sendMessage(responseMsgHeader + "\n\n" + transcript, {
								quotedMessageId: messageId
							});
						}
					})
					.catch((err) => {
						console.error(err); // Handle the error here
						chat.sendMessage(responseMsgHeaderError, {
							quotedMessageId: messageId
						});
					});
				} else {
					message.reply("The file couldn't be fetched");
				}
			}
		}
	}
    
}
/*
axios.post("https://api.openai.com/v1/audio/transcriptions", formData,{
    headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "multipart/form-data; boundry=${formData._boundary}",
    }
})*/
// Text to speech function

//----------------------------------------------------------------------------------------------------------------------------------

/**
 * Funcion que envia el mensaje a la api de open ai, y luego recibe el mensaje de chatGPT 
 * @param {string} message mensaje que se envia a la api de open ai
 * @param {string} speciality que tipo de persona es el ai (asistente, ruso drogado, etc)
 * @returns el mensaje de chatGPT.
 */
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

//funcion que crea objeto MySearchOptions que se pasan a fetchMessages()
function MySearchOptions(limit, fromMe) {
    this.limit = limit;
    this.fromMe = fromMe;
}
  

async function print(msg, amount){
    try{
        const mensajes = await fetchamount(msg,amount);
        let linea = new Array(amount);
        var contacto;
        var nombre
        var texto;
        for (let i = 0; i < mensajes.length; i++) {
            contacto=await mensajes[i].getContact();
            nombre=contacto.name;
            texto=mensajes[i].body;
            linea[i]=nombre + ": " + texto ;
        }
        //const concatMessages = mensajes.map(mensaje =>  mensaje.author + ": " +mensaje.body).join('\n');
        return linea.join("\n");
    }
    catch(err){
        console.log('print error: ' + err);
    }
}

//busca cierto amount de messages de ese chat
async function fetchamount(msg, amount){
    const chat = await msg.getChat();
    let plusOne=amount;plusOne++; //suma un mensaje para despues sacar el ultimo
    try{
        const options = new MySearchOptions(plusOne, undefined);
        const mensajes = await chat.fetchMessages(options);
        mensajes.splice(-1); //saca el ultimo mensaje (el que pidio el fetch o lo que sea)
        return mensajes;
    }
    catch(err){
        console.log('fetch error: ' + err);
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

        if (msg.hasQuotedMsg && (msg.body === "texto" || msg.body === "Texto")) { // check if message is a reply
           dealWithAudio(msg);
        }
        
        

        const [firstWord, restOfStr] = getFirstWord(msg.body);
        if(firstWord === 'resumime' || firstWord === 'Resumime' || firstWord === 'resumi' || firstWord === 'Resumi'){
            const groupName = restOfStr;
            if(groupName){
                createMeSummarySUMMA(msg, groupName);
            }

        }
        if((firstWord === 'gpt'  || firstWord === 'Gpt') && chatIsAppropiate(msg)){
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



// cuando recibe un mensaje ageno que no es el bot ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
client.on('message' , async msg => {
    
   
    const contact = await msg.getContact();
    const chat  = await msg.getChat();
    const msgTo = chat.name;
    const contactPushName = contact.pushname;
    const contactNumber = contact.number;
    console.log('\x1b[90m{'+ `\x1b[31m[${contactNumber} : \x1b[34m${contactPushName}\x1b[31m]`+ `\x1b[90m --to-->` + ` \x1b[36m${msgTo}\x1b[31m `+`\x1b[90m:`+` \x1b[32m${msg.body}\x1b[31m`+'\x1b[90m}');

    if (msg.hasQuotedMsg && (msg.body === "texto" || msg.body === "Texto")) { // check if message is a reply
        dealWithAudio(msg);
    }

    const [firstWord, restOfStr] = getFirstWord(msg.body); //no borres esto porque lo uso en varios ifs
    if((firstWord === 'gpt:'  || firstWord === 'Gpt:')  && chatIsAppropiate(msg) && chat.name === 'Csal(Amadé)ád'){
        runCompletion(restOfStr, "Sos un asistente que responde con simpleza y es muy inteligente").then(result => msg.reply(result));      
    }

    if(chat.isGroup && firstWord.toLowerCase() !== 'summa' ) {
        await saveMessagesSUMMA(msg);
    }
    if (firstWord.toLowerCase() === 'summa') {  
        msg.react('👍');
        await createSummarySUMMA(msg);
    }
    else if (firstWord.toLowerCase() === 'print' && chatIsAppropiate(msg)  ) {       // https://docs.wwebjs.dev/Chat.html 
        msg.react('👍');
        const [secondWord,restOfRestOfStr]=getFirstWord(restOfStr)
        var cantidad=undefined;
        if (!isNaN(secondWord)) {
            cantidad=secondWord;
        }
        const reply = await print(msg, cantidad);
        msg.reply(reply);
    }
    


});

function chatIsAppropiate(message){
    const chat = message.getChat();
     return !(chat.isGroup && (chat.name === 'BD I' || chat.name === 'Inge Soft I' || chat.name === 'SO' || chat.name === 'HCI' || chat.name === 'Photo Dump Elite Elite'));
}
client.initialize();
