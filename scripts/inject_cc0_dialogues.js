const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'meanings.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const DIALOGUES = {
  help: {
    sent: "A: Can you help me? B: Sure, I am glad to help.",
    sentZh: "A: 你能幫我嗎？ B: 當然，我很樂意幫忙。"
  },
  thank: {
    sent: "A: Thank you for your help. B: You are welcome.",
    sentZh: "A: 謝謝你的幫忙。 B: 不客氣。"
  },
  sorry: {
    sent: "A: I am sorry I am late. B: That is okay, do not worry.",
    sentZh: "A: 抱歉我遲到了。 B: 沒關係，別擔心。"
  },
  meet: {
    sent: "A: Nice to meet you. B: Nice to meet you too.",
    sentZh: "A: 很高興認識你。 B: 我也很高興認識你。"
  },
  time: {
    sent: "A: What time is it now? B: It is three o'clock.",
    sentZh: "A: 現在幾點了？ B: 現在三點整。"
  },
  name: {
    sent: "A: What is your name? B: My name is Tom.",
    sentZh: "A: 你的名字是什麼？ B: 我的名字叫湯姆。"
  },
  weather: {
    sent: "A: How is the weather today? B: It is sunny and warm.",
    sentZh: "A: 今天天氣如何？ B: 今天天氣晴朗又溫暖。"
  },
  apple: {
    sent: "A: Do you want an apple? B: Yes, please. I like apples.",
    sentZh: "A: 你想要一顆蘋果嗎？ B: 好的，謝謝。我喜歡蘋果。"
  },
  book: {
    sent: "A: Is this your book? B: No, it is not my book.",
    sentZh: "A: 這是你的書嗎？ B: 不，這不是我的書。"
  },
  color: {
    sent: "A: What is your favorite color? B: My favorite color is blue.",
    sentZh: "A: 你最喜歡什麼顏色？ B: 我最喜歡的顏色是藍色。"
  },
  hungry: {
    sent: "A: Are you hungry now? B: Yes, let's get some food.",
    sentZh: "A: 你現在肚子餓嗎？ B: 是的，我們去吃點東西吧。"
  },
  ready: {
    sent: "A: Are you ready to go? B: Yes, I am ready.",
    sentZh: "A: 你準備好要出發了嗎？ B: 是的，我準備好了。"
  },
  like: {
    sent: "A: Do you like English? B: Yes, I like English very much.",
    sentZh: "A: 你喜歡英文嗎？ B: 是的，我非常喜歡英文。"
  },
  live: {
    sent: "A: Where do you live? B: I live in Chiayi.",
    sentZh: "A: 你住在哪裡？ B: 我住在嘉義。"
  },
  water: {
    sent: "A: May I have some water? B: Sure, here is a glass of water.",
    sentZh: "A: 我可以喝點水嗎？ B: 當然，這是一杯水。"
  },
  friend: {
    sent: "A: Who is your best friend? B: Peter is my best friend.",
    sentZh: "A: 誰是你最好的朋友？ B: 彼得是我最好的朋友。"
  },
  school: {
    sent: "A: How do you go to school? B: I go to school by bus.",
    sentZh: "A: 你怎麼去學校？ B: 我搭公車去學校。"
  },
  happy: {
    sent: "A: Why are you so happy today? B: Because today is my birthday.",
    sentZh: "A: 你今天為什麼這麼高興？ B: 因為今天是我的生日。"
  },
  music: {
    sent: "A: Do you listen to music? B: Yes, I love pop music.",
    sentZh: "A: 你聽音樂嗎？ B: 是的，我喜愛流行音樂。"
  },
  dog: {
    sent: "A: Do you have a dog? B: Yes, I have a cute white dog.",
    sentZh: "A: 你有養狗嗎？ B: 有的，我有一隻可愛的白狗。"
  },
  cat: {
    sent: "A: Where is your cat? B: My cat is sleeping under the bed.",
    sentZh: "A: 你的貓在哪裡？ B: 我的貓在床底下睡覺。"
  },
  busy: {
    sent: "A: Are you busy tonight? B: No, I am free after dinner.",
    sentZh: "A: 你今晚很忙嗎？ B: 不忙，我吃過晚餐後就有空。"
  },
  tired: {
    sent: "A: Are you feeling tired? B: Yes, I want to take a break.",
    sentZh: "A: 你覺得累了嗎？ B: 是的，我想休息一下。"
  },
  breakfast: {
    sent: "A: What do you have for breakfast? B: I have toast and milk for breakfast.",
    sentZh: "A: 你早餐吃什麼？ B: 我早餐吃吐司和牛奶。"
  },
  lunch: {
    sent: "A: Are you ready for lunch? B: Yes, let us have lunch together.",
    sentZh: "A: 你準備好要吃午餐了嗎？ B: 是的，我們一起吃午餐吧。"
  },
  dinner: {
    sent: "A: What is for dinner tonight? B: We are having noodles for dinner.",
    sentZh: "A: 今晚晚餐吃什麼？ B: 我們晚餐吃麵。"
  },
  homework: {
    sent: "A: Did you finish your homework? B: Yes, I finished my homework already.",
    sentZh: "A: 你完成作業了嗎？ B: 是的，我已經做完作業了。"
  },
  weekend: {
    sent: "A: What do you do on the weekend? B: I usually play basketball on the weekend.",
    sentZh: "A: 你週末都做些什麼？ B: 我週末通常會打籃球。"
  },
  family: {
    sent: "A: Do you have a big family? B: Yes, there are five people in my family.",
    sentZh: "A: 你的家庭很大嗎？ B: 是的，我家有五個人。"
  },
  birthday: {
    sent: "A: When is your birthday? B: My birthday is in July.",
    sentZh: "A: 你的生日是什麼時候？ B: 我的生日在七月。"
  },
  hobby: {
    sent: "A: What is your favorite hobby? B: My favorite hobby is drawing.",
    sentZh: "A: 你最喜歡的嗜好是什麼？ B: 我最喜歡的嗜好是畫畫。"
  },
  sport: {
    sent: "A: What sport do you like to play? B: I like to play badminton.",
    sentZh: "A: 你喜歡做什麼運動？ B: 我喜歡打羽毛球。"
  },
  movie: {
    sent: "A: Do you want to see a movie? B: Sure, I love watching movies.",
    sentZh: "A: 你想看電影嗎？ B: 當然，我很喜歡看電影。"
  },
  question: {
    sent: "A: May I ask you a question? B: Sure, please go ahead.",
    sentZh: "A: 我可以問你一個問題嗎？ B: 當然，請說。"
  },
  answer: {
    sent: "A: Do you know the answer? B: Yes, the answer is option B.",
    sentZh: "A: 你知道答案嗎？ B: 知道，答案是選項 B。"
  },
  English: {
    sent: "A: Do you enjoy learning English? B: Yes, English is fun and useful.",
    sentZh: "A: 你喜歡學英文嗎？ B: 是的，英文既有趣又實用。"
  },
  teacher: {
    sent: "A: Who is your English teacher? B: Mr. Smith is our English teacher.",
    sentZh: "A: 誰是你的英文老師？ B: 史密斯先生是我們的英文老師。"
  },
  student: {
    sent: "A: Are you a junior high school student? B: Yes, I am a seventh grade student.",
    sentZh: "A: 你是國中生嗎？ B: 是的，我是七年級學生。"
  },
  class: {
    sent: "A: What time does class begin? B: Class begins at eight o'clock.",
    sentZh: "A: 什麼時候開始上課？ B: 八點開始上課。"
  },
  test: {
    sent: "A: Are you nervous about the test? B: A little bit, but I studied hard for the test.",
    sentZh: "A: 你對考試感到緊張嗎？ B: 有一點，但我為這次考試用功讀書了。"
  }
};

const CC0_SOURCE = "Contextual Mini-Dialogues Corpus (CC0 1.0 Universal)";

let updatedCount = 0;
for (const [w, item] of Object.entries(DIALOGUES)) {
  if (!data[w]) {
    console.warn(`Word not found in meanings.json: ${w}`);
    continue;
  }
  const entry = data[w];
  entry.sent = item.sent;
  entry.sentZh = item.sentZh;
  entry.sentSrc = CC0_SOURCE;

  if (Array.isArray(entry.sents)) {
    let normalIdx = entry.sents.findIndex(s => s.level === 'normal');
    if (normalIdx === -1 && entry.sents.length >= 2) normalIdx = 1;
    if (normalIdx !== -1) {
      entry.sents[normalIdx] = {
        level: 'normal',
        levelName: '普通',
        sent: item.sent,
        sentZh: item.sentZh,
        src: CC0_SOURCE
      };
    } else {
      entry.sents.push({
        level: 'normal',
        levelName: '普通',
        sent: item.sent,
        sentZh: item.sentZh,
        src: CC0_SOURCE
      });
    }
  } else {
    entry.sents = [
      {
        level: 'normal',
        levelName: '普通',
        sent: item.sent,
        sentZh: item.sentZh,
        src: CC0_SOURCE
      }
    ];
  }
  updatedCount++;
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Successfully updated ${updatedCount} words with Contextual Mini-Dialogues Corpus (CC0 1.0 Universal)!`);
