// Kami character data generator

const kamiNames = [
    { title: 'Amaterasu', japanese: '天照' },
    { title: 'Tsukuyomi', japanese: '月読' },
    { title: 'Susanoo', japanese: '須佐之男' },
    { title: 'Inari', japanese: '稲荷' },
    { title: 'Raijin', japanese: '雷神' },
    { title: 'Fujin', japanese: '風神' },
    { title: 'Benzaiten', japanese: '弁財天' },
    { title: 'Ebisu', japanese: '恵比寿' }
];

export function generateKamiData() {
    const randomKami = kamiNames[Math.floor(Math.random() * kamiNames.length)];
    const id = `kami-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
        id,
        title: randomKami.title,
        japanese: randomKami.japanese,
        createdAt: new Date().toISOString()
    };
}
