// data/kamiData.mjs
import { nanoid } from "nanoid";

const kamiData = [];

export const addKami = (kami) => {
    if (!kami || typeof kami !== "object") return;
    kamiData.push(kami);
};

export const getKamis = () => {
    return kamiData;
};

export const generateKamiData = () => {
    const kamiNames = [
        "イザナギ", "イザナミ", "アメノミナカヌシ",
        "タカミムスビ", "カミムスビ", "オオクニヌシ",
        "スサノオ", "アマテラス", "ツクヨミ", "タケミカヅチ"
    ];

    const hiraganaNames = [
        "いざなぎ", "いざなみ", "あめのみなかぬし",
        "たかみむすび", "かみむすび", "おおくにぬし",
        "すさのお", "あまてらす", "つくよみ", "たけみかづち"
    ];

    const images = [
        "/media/izanagi.png",
        "/media/izanami.png",
        "/media/kamiyo.png"
    ];

    // Pick a random index for the name arrays
    const index = Math.floor(Math.random() * kamiNames.length);
    const title = kamiNames[index];
    const japanese = hiraganaNames[index];
    const image = images[Math.floor(Math.random() * images.length)];
    const id = `KAMI_${nanoid(8)}`;

    const newKami = { id, image, title, japanese };

    console.log("generateKamiData() called. Returning:", newKami);

    return newKami;
};

export { kamiData };
