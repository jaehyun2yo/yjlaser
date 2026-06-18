const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(
  __dirname,
  '../public/test/Gemini_Generated_Image_m33n3hm33n3hm33n.png'
);
const outputDir = path.join(__dirname, '../public/images/box-shapes');

// 출력 폴더 생성
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 박스 이름 (순서대로)
const boxNames = [
  'b-box', // 1행 1열
  'tuck', // 1행 2열
  'y-box', // 1행 3열
  'a-box', // 1행 4열
  'c1-box', // 2행 1열
  'c2-box', // 2행 2열
  'pj-pg', // 2행 3열
  'pvc', // 2행 4열
  'sb-vb', // 3행 1열
  'pad', // 3행 2열
  'folder', // 3행 3열
  'shopping', // 3행 4열
];

async function cropImages() {
  try {
    // 원본 이미지 메타데이터 가져오기
    const metadata = await sharp(inputPath).metadata();
    console.log(`원본 이미지 크기: ${metadata.width}x${metadata.height}`);

    // 4열 3행 그리드
    const cols = 4;
    const rows = 3;
    const cellWidth = Math.floor(metadata.width / cols);
    const cellHeight = Math.floor(metadata.height / rows);

    console.log(`셀 크기: ${cellWidth}x${cellHeight}`);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const boxName = boxNames[index];

        const left = col * cellWidth;
        const top = row * cellHeight;

        const outputPath = path.join(outputDir, `${boxName}.png`);

        await sharp(inputPath)
          .extract({
            left: left,
            top: top,
            width: cellWidth,
            height: cellHeight,
          })
          .png()
          .toFile(outputPath);

        console.log(`저장 완료: ${boxName}.png (${left}, ${top}, ${cellWidth}x${cellHeight})`);
      }
    }

    console.log('\n모든 이미지 자르기 완료!');
  } catch (error) {
    console.error('에러 발생:', error);
  }
}

cropImages();
