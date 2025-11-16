// lib/agent.js
import fs from 'fs';
import { join } from 'path';

const characterPath = join(__dirname, '../character-kamiyo.json');
const characterRaw = fs.readFileSync(characterPath, 'utf8');
const character = JSON.parse(characterRaw);

console.log('Loaded character:', character.name);

function initializeEliza() {
    return import('eliza').then(({ default: Eliza }) => {
        const eliza = new Eliza();

        eliza.name = character.name;
        eliza.bio = character.bio;
        eliza.responses = character.messageExamples.reduce((acc, conv) => {
            conv.forEach(msg => {
                if (msg.user === character.name && msg.content.text) {
                    acc[msg.content.text] = character.responses?.[msg.content.text] || character.default;
                }
            });
            return acc;
        }, {});
        eliza.defaultResponse = character.settings.modelConfig.max_response_length
            ? character.default.slice(0, character.settings.modelConfig.max_response_length)
            : character.default;

        return eliza;
    }).catch(err => {
        console.error('Error loading Kamiyo data:', err);
        throw err;
    });
}
export { initializeEliza, character };
