const text = 'ميريندا برتقال مشروب غازي 325مل';
const candidate = 'ميريندا برتقال 320مل';
const text2 = 'ميريندا برتقال مشروب غازي 325ملغم'; // should not match 'مل' because followed by 'غم'
const text3 = 'ميريندا برتقال مشروب غازي 325مل '; // trailing space

const reArabic = /(?:\d+[x×])?([\d]+(?:[.,]\d+)?)\s*(مل|ملل|لتر|جرام|غرام|غ|جم|كجم|كغ|كيلو|كيلوجرام|كيلوغرام)(?![a-zA-Z0-9\u0600-\u06FF])/g;

console.log('text:', text.match(reArabic));
console.log('candidate:', candidate.match(reArabic));
console.log('text2:', text2.match(reArabic));
console.log('text3:', text3.match(reArabic));
