const axios = require('axios');

const wordApiServer = "https://random-word-api.herokuapp.com";
const meaningApiServer = "https://api.dictionaryapi.dev/api/v2/entries/en/";

const fetchWord = async () => {
    try {
        const response = await axios.get(
            `${wordApiServer}/word?length=${Math.floor((Math.random() * 8) + 5)}`
        );
        const word = response.data[0];
        return word;
    } catch (error) {
        console.error('Error fetching word:', error.message);
        throw error;
    }
}

const fetchWordMeaning = async (word) => {
    try {
        const response = await axios.get(`${meaningApiServer}${word.toLowerCase()}`);
        const meanings = response.data[0]?.meanings;
        return meanings ?? [];
    } catch (error) {
        console.error(`Error fetching meaning for '${word}': ${error.message}`);
        throw error; // Rethrow the error to trigger fetching a new word
    }
}

const getWordAndMeaning = async () => {
    let word = await fetchWord();
    let meaning;
    try {
        meaning = await fetchWordMeaning(word);
    } catch (error) {
        // do nothing
    }
    return { word, meaning: meaning || [] };
}

const GET = async () => {
    try {
        const wordAndMeaning = await getWordAndMeaning();
        return wordAndMeaning;
    } catch (error) {
        console.error('Error:', error.message);
    }
};


module.exports = GET;
