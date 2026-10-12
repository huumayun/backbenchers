export interface ChapterSection {
  id: string;
  label: string;
  badgeClass: "ka" | "kha" | "ga";
  startPage: number;
  endPage: number;
  questionCount?: number;
  questionCountBn?: string;
}

export interface ChapterQuestionCounts {
  ka: number;
  kha: number;
  ga: number;
  kaBn: string;
  khaBn: string;
  gaBn: string;
  total: number;
  totalBn: string;
}

export interface Chapter {
  id: string;
  index: number;
  bookNumber: number;
  courseCode: string;
  title: string;
  titleBn: string;
  startPage: number; // Always 1 for standalone book
  endPage: number;   // Total pages of this standalone book
  freePagesUpTo: number; // Free preview pages in this book (1-indexed)
  questionCounts: ChapterQuestionCounts;
  sections: ChapterSection[];
}

export const FREE_PAGE_LIMIT = 1;
export const TOTAL_BOOK_PAGES = 177;

export const CHAPTERS: Chapter[] = [
  {
    id: "subject-233001",
    index: 0,
    bookNumber: 1,
    courseCode: "233001",
    title: "Gymnosperm, Palaeobotany & Palynology",
    titleBn: "জিম্নোস্পার্ম, প্যালিওবোটানি ও প্যালিনোলজি",
    startPage: 1,
    endPage: 23,
    freePagesUpTo: 1,
    questionCounts: {
      ka: 50,
      kha: 15,
      ga: 15,
      kaBn: "৫০টি",
      khaBn: "১৫টি",
      gaBn: "১৫টি",
      total: 80,
      totalBn: "৮০টি",
    },
    sections: [
      { id: "sec-ka-233001", label: "ক-বিভাগ (অতি সংক্ষিপ্ত)", badgeClass: "ka", startPage: 1, endPage: 2, questionCount: 50, questionCountBn: "৫০টি" },
      { id: "sec-kha-233001", label: "খ-বিভাগ (সংক্ষিপ্ত)", badgeClass: "kha", startPage: 3, endPage: 8, questionCount: 15, questionCountBn: "১৫টি" },
      { id: "sec-ga-233001", label: "গ-বিভাগ (রচনামূলক)", badgeClass: "ga", startPage: 9, endPage: 23, questionCount: 15, questionCountBn: "১৫টি" },
    ],
  },
  {
    id: "subject-233003",
    index: 1,
    bookNumber: 2,
    courseCode: "233003",
    title: "Plant Physiology & Plant Nutrition",
    titleBn: "উদ্ভিদ শারীরবিদ্যা ও উদ্ভিদ পুষ্টি",
    startPage: 1,
    endPage: 24,
    freePagesUpTo: 1,
    questionCounts: {
      ka: 50,
      kha: 16,
      ga: 15,
      kaBn: "৫০টি",
      khaBn: "১৬টি",
      gaBn: "১৫টি",
      total: 81,
      totalBn: "৮১টি",
    },
    sections: [
      { id: "sec-ka-233003", label: "ক-বিভাগ (অতি সংক্ষিপ্ত)", badgeClass: "ka", startPage: 1, endPage: 2, questionCount: 50, questionCountBn: "৫০টি" },
      { id: "sec-kha-233003", label: "খ-বিভাগ (সংক্ষিপ্ত)", badgeClass: "kha", startPage: 3, endPage: 9, questionCount: 16, questionCountBn: "১৬টি" },
      { id: "sec-ga-233003", label: "গ-বিভাগ (রচনামূলক)", badgeClass: "ga", startPage: 10, endPage: 24, questionCount: 15, questionCountBn: "১৫টি" },
    ],
  },
  {
    id: "subject-233005",
    index: 2,
    bookNumber: 3,
    courseCode: "233005",
    title: "Plant Biochemistry",
    titleBn: "প্ল্যান্ট বায়োকেমিস্ট্রি",
    startPage: 1,
    endPage: 29,
    freePagesUpTo: 1,
    questionCounts: {
      ka: 50,
      kha: 15,
      ga: 21,
      kaBn: "৫০টি",
      khaBn: "১৫টি",
      gaBn: "২১টি",
      total: 86,
      totalBn: "৮৬টি",
    },
    sections: [
      { id: "sec-ka-233005", label: "ক-বিভাগ (অতি সংক্ষিপ্ত)", badgeClass: "ka", startPage: 1, endPage: 2, questionCount: 50, questionCountBn: "৫০টি" },
      { id: "sec-kha-233005", label: "খ-বিভাগ (সংক্ষিপ্ত)", badgeClass: "kha", startPage: 3, endPage: 8, questionCount: 15, questionCountBn: "১৫টি" },
      { id: "sec-ga-233005", label: "গ-বিভাগ (রচনামূলক)", badgeClass: "ga", startPage: 9, endPage: 29, questionCount: 21, questionCountBn: "২১টি" },
    ],
  },
  {
    id: "subject-233007",
    index: 3,
    bookNumber: 4,
    courseCode: "233007",
    title: "Ecology & Environmental Science",
    titleBn: "বাস্তুবিদ্যা ও পরিবেশবিজ্ঞান",
    startPage: 1,
    endPage: 32,
    freePagesUpTo: 1,
    questionCounts: {
      ka: 51,
      kha: 17,
      ga: 23,
      kaBn: "৫১টি",
      khaBn: "১৭টি",
      gaBn: "২৩টি",
      total: 91,
      totalBn: "৯১টি",
    },
    sections: [
      { id: "sec-ka-233007", label: "ক-বিভাগ (অতি সংক্ষিপ্ত)", badgeClass: "ka", startPage: 1, endPage: 2, questionCount: 51, questionCountBn: "৫১টি" },
      { id: "sec-kha-233007", label: "খ-বিভাগ (সংক্ষিপ্ত)", badgeClass: "kha", startPage: 3, endPage: 9, questionCount: 17, questionCountBn: "১৭টি" },
      { id: "sec-ga-233007", label: "গ-বিভাগ (রচনামূলক)", badgeClass: "ga", startPage: 10, endPage: 32, questionCount: 23, questionCountBn: "২৩টি" },
    ],
  },
  {
    id: "subject-233009",
    index: 4,
    bookNumber: 5,
    courseCode: "233009",
    title: "Plant Pathology",
    titleBn: "উদ্ভিদ রোগতত্ত্ব",
    startPage: 1,
    endPage: 23,
    freePagesUpTo: 1,
    questionCounts: {
      ka: 50,
      kha: 15,
      ga: 15,
      kaBn: "৫০টি",
      khaBn: "১৫টি",
      gaBn: "১৫টি",
      total: 80,
      totalBn: "৮০টি",
    },
    sections: [
      { id: "sec-ka-233009", label: "ক-বিভাগ (অতি সংক্ষিপ্ত)", badgeClass: "ka", startPage: 1, endPage: 2, questionCount: 50, questionCountBn: "৫০টি" },
      { id: "sec-kha-233009", label: "খ-বিভাগ (সংক্ষিপ্ত)", badgeClass: "kha", startPage: 3, endPage: 8, questionCount: 15, questionCountBn: "১৫টি" },
      { id: "sec-ga-233009", label: "গ-বিভাগ (রচনামূলক)", badgeClass: "ga", startPage: 9, endPage: 23, questionCount: 15, questionCountBn: "১৫টি" },
    ],
  },
  {
    id: "subject-233011",
    index: 5,
    bookNumber: 6,
    courseCode: "233011",
    title: "Cytology & Cytogenetics",
    titleBn: "সাইটোলজি ও সাইটোজেনেটিক্স",
    startPage: 1,
    endPage: 23,
    freePagesUpTo: 1,
    questionCounts: {
      ka: 50,
      kha: 15,
      ga: 15,
      kaBn: "৫০টি",
      khaBn: "১৫টি",
      gaBn: "১৫টি",
      total: 80,
      totalBn: "৮০টি",
    },
    sections: [
      { id: "sec-ka-233011", label: "ক-বিভাগ (অতি সংক্ষিপ্ত)", badgeClass: "ka", startPage: 1, endPage: 2, questionCount: 50, questionCountBn: "৫০টি" },
      { id: "sec-kha-233011", label: "খ-বিভাগ (সংক্ষিপ্ত)", badgeClass: "kha", startPage: 3, endPage: 8, questionCount: 15, questionCountBn: "১৫টি" },
      { id: "sec-ga-233011", label: "গ-বিভাগ (রচনামূলক)", badgeClass: "ga", startPage: 9, endPage: 23, questionCount: 15, questionCountBn: "১৫টি" },
    ],
  },
  {
    id: "subject-233013",
    index: 6,
    bookNumber: 7,
    courseCode: "233013",
    title: "Genetics",
    titleBn: "বংশগতিবিদ্যা",
    startPage: 1,
    endPage: 23,
    freePagesUpTo: 1,
    questionCounts: {
      ka: 50,
      kha: 14,
      ga: 15,
      kaBn: "৫০টি",
      khaBn: "১৪টি",
      gaBn: "১৫টি",
      total: 79,
      totalBn: "৭৯টি",
    },
    sections: [
      { id: "sec-ka-233013", label: "ক-বিভাগ (অতি সংক্ষিপ্ত)", badgeClass: "ka", startPage: 1, endPage: 2, questionCount: 50, questionCountBn: "৫০টি" },
      { id: "sec-kha-233013", label: "খ-বিভাগ (সংক্ষিপ্ত)", badgeClass: "kha", startPage: 3, endPage: 8, questionCount: 14, questionCountBn: "১৪টি" },
      { id: "sec-ga-233013", label: "গ-বিভাগ (রচনামূলক)", badgeClass: "ga", startPage: 9, endPage: 23, questionCount: 15, questionCountBn: "১৫টি" },
    ],
  },
];

export const BOOK_INFO = {
  title: "সাজেশন ফর ব্যাকবেঞ্চার্স",
  subtitle: "উদ্ভিদবিজ্ঞান • বোটানি অনার্স ৩য় বর্ষ (৭টি বইয়ের সিরিজ)",
  edition: "অনার্স ৩য় বর্ষ স্পেশাল এডিশন ২০২৬",
  university: "জাতীয় বিশ্ববিদ্যালয় • উদ্ভিদবিজ্ঞান",
  titleEn: "Suggestion for Backbenchers",
  subtitleEn: "Botany Honours 3rd Year",
  totalPages: TOTAL_BOOK_PAGES,
  freePagesLimit: FREE_PAGE_LIMIT,
  contactTelegram: "https://t.me/your_telegram_username",
  contactWhatsApp: "https://wa.me/8801700000000?text=%E0%A6%86%E0%A6%B8%E0%A6%B8%E0%A6%BE%E0%A6%B2%E0%A6%BE%E0%A6%AE%E0%A7%81%20%E0%A6%86%E0%A6%B2%E0%A6%BE%E0%A6%87%E0%A6%95%E0%A7%81%E0%A6%AE%2C%20%E0%A6%86%E0%A6%AE%E0%A6%BF%20%27%E0%A6%B8%E0%A6%BE%E0%A6%9C%E0%A7%87%E0%A6%B6%E0%A6%A8%20%E0%A6%AB%E0%A6%B0%20%E0%A6%AC%E0%A7%8D%E0%A6%AF%E0%A6%BE%E0%A6%95%E0%A6%AC%E0%A7%87%E0%A6%9E%E0%A7%8D%E0%A6%9A%E0%A6%BE%E0%A6%B0%E0%A7%8D%E0%A6%B8%20(%E0%A6%AC%E0%A7%8B%E0%A6%9F%E0%A6%BE%E0%A6%A8%E0%A6%BF%20%E0%A7%A9%E0%A6%AF%E0%A6%BC%20%E0%A6%AC%E0%A6%B0%E0%A7%8D%E0%A6%B7)%27%20%E0%A6%AC%E0%A6%87%E0%A6%9F%E0%A6%BF%20%E0%A6%86%E0%A6%A8%E0%A6%B2%E0%A6%95%20%E0%A6%95%E0%A6%B0%E0%A6%BE%E0%A6%B0%20%E0%A6%95%E0%A7%8B%E0%A6%A1%20%E0%A6%A8%E0%A6%BF%E0%A6%A4%E0%A7%87%20%E0%A6%9A%E0%A6%BE%E0%A6%87%E0%A5%A4",
  whatsappNumber: "017XX-XXXXXX",
  telegramUsername: "@your_telegram_username",
  paymentMethods: "বিকাশ / নগদ (Send Money): 017XX-XXXXXX",
  price: "১৫০ টাকা",
  coverColor: "#004d40",
};
