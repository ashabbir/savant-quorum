const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  });

  const svgPath = path.resolve(__dirname, '../src/renderer/public/main.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  // Wrap in margin-free layout and set dimensions
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 1024px;
          height: 1024px;
          overflow: hidden;
          background: transparent;
        }
        svg {
          width: 1024px;
          height: 1024px;
          display: block;
        }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `;

  const tempHtmlPath = path.resolve(__dirname, '../temp_icon.html');
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

  await win.loadFile(tempHtmlPath);

  // Wait for rendering to settle
  await new Promise(resolve => setTimeout(resolve, 800));

  const image = await win.webContents.capturePage();
  const pngBuffer = image.toPNG();

  const outPath = path.resolve(__dirname, '../build/icon.png');
  fs.writeFileSync(outPath, pngBuffer);

  // Clean up
  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {}

  console.log('Successfully converted main.svg to build/icon.png');
  app.quit();
});
