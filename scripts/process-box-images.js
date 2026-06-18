const sharp = require('sharp');
const path = require('path');

const sourceImage = path.join(
  __dirname,
  '../public/test/Gemini_Generated_Image_m33n3hm33n3hm33n.png'
);
const outputDir = path.join(__dirname, '../public/images/box-shapes');

// 박스 이름 목록
const boxNames = [
  'b-box',
  'tuck',
  'y-box',
  'a-box',
  'c1-box',
  'c2-box',
  'pj-pg',
  'pvc',
  'sb-vb',
  'pad',
  'folder',
  'shopping',
];

async function processImages() {
  try {
    // 원본 이미지 메타데이터 가져오기
    const metadata = await sharp(sourceImage).metadata();
    console.log(`원본 이미지 크기: ${metadata.width}x${metadata.height}`);

    const cols = 4;
    const rows = 3;
    const cellWidth = Math.floor(metadata.width / cols);
    const cellHeight = Math.floor(metadata.height / rows);

    // 내부 여백 (테두리 제거)
    const padding = 30;

    console.log(`셀 크기: ${cellWidth}x${cellHeight}`);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const boxName = boxNames[index];

        const left = col * cellWidth + padding;
        const top = row * cellHeight + padding;
        const extractWidth = cellWidth - padding * 2;
        const extractHeight = cellHeight - padding * 2;

        const outputPath = path.join(outputDir, `${boxName}.png`);

        // 셀 추출 (패딩 적용하여 중앙 박스만)
        await sharp(sourceImage)
          .extract({
            left: left,
            top: top,
            width: extractWidth,
            height: extractHeight,
          })
          .png()
          .toFile(outputPath);

        console.log(`처리 완료: ${boxName}.png (${extractWidth}x${extractHeight})`);
      }
    }

    console.log('\n모든 이미지 크롭 완료!');
  } catch (error) {
    console.error('에러 발생:', error);
  }
}

processImages();
