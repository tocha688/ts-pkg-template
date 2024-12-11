const path = require("path")
const fs = require("fs")
const NCC = require('@vercel/ncc');
const { execSync } = require('child_process');
const ResEdit = require("resedit")
const config = require("../config.json")

const buildMain = path.join(process.cwd(), "/src/index.ts");
const outputPath = path.join(process.cwd(), "/dist");
const nccTempPath = path.join(outputPath, "/.ncc")
const iconPath = path.join(__dirname, "../favicon.ico")
const targetBin="node18-win-x64"

//-e加密 -b打包build
const ENV_BUILD = "-b";
const ENV_ENCODE = "-e";
function compile() {
  NCC(buildMain, {
    // provide a custom cache path or disable caching
    cache: false,
    // externals to leave as requires of the build
    externals: ["externalpackage"],
    // directory outside of which never to emit assets
    filterAssetBase: process.cwd(), // default
    minify: true, // default
    sourceMap: false, // default
    assetBuilds: false, // default
    sourceMapBasePrefix: '../', // default treats sources as output-relative
    // when outputting a sourcemap, automatically include
    // source-map-support in the output file (increases output by 32kB).
    sourceMapRegister: false, // default
    watch: false, // default
    license: '', // default does not generate a license file
    v8cache: false, // default
    quiet: false, // default
    debugLog: false // default
  }).then(async ({ code, map, assets }) => {
    //获取输出文件路径
    const outPath = process.argv.find(x => x == ENV_BUILD) ? nccTempPath : outputPath;
    //删除旧文件
    if (fs.existsSync(outPath)) {
      fs.rmSync(outPath, { recursive: true })
    }
    fs.mkdirSync(outPath, { recursive: true })
    //输出资源文件
    Object.keys(assets).forEach(key => {
      if (key.includes(".d.ts")) return;
      const _filepath = path.join(outPath, key);
      fs.mkdirSync(path.dirname(_filepath), { recursive: true })
      fs.writeFileSync(_filepath, assets[key].source)
    })
    //是否加密
    if (process.argv.find(x => x == ENV_ENCODE)) {
      const obfuscator = require("./javascript-obfuscator.json")
      const obfuscationResult = require('javascript-obfuscator').obfuscate(
        code, {
        "compact": true,
        ...obfuscator
      });
      code = obfuscationResult.getObfuscatedCode();
    }
    //注入代码
    const injectPath = path.join(__dirname, "/inject.js");
    if (fs.existsSync(injectPath)) {
      code = fs.readFileSync(injectPath, "utf-8") + "\n" + code
    }
    //输出主文件
    const mainPath = path.join(outPath, "/index.js");
    fs.writeFileSync(mainPath, code)
    if (process.argv.find(x => x == ENV_BUILD)) {
      //进行pkg打包
      const pkgjson = {
        "name": config.name,
        "version": "1.0.0",
        "main": ".ncc/index.js",
        "bin": ".ncc/index.js",
        "scripts": {
          "build": "pkg ."
        },
        "pkg": {
          "scripts": ".ncc/**/*.js",
          "assets": [".ncc/**/*", "!**/*.js"],
          "targets": [
            // "node18-win-x64"
            targetBin
          ],
        },
        "license": "MIT",
        "devDependencies": {
        },
        "dependencies": {
        }
      }
      //输出
      const pkgpath = path.join(outputPath, "package.json")
      fs.writeFileSync(pkgpath, JSON.stringify(pkgjson))
      //运行打包
      execSync("npm run build", { cwd: outputPath })
      fs.rmSync(pkgpath)
      fs.rmSync(nccTempPath, { recursive: true })
      //修改资源
      console.log("开始写入文件信息")
      const exePath = path.join(outputPath, config.name + ".exe")
      const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath))
      const res = ResEdit.NtExecutableResource.from(exe)
      const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
      const vi = viList[0];
      const theversion = `${config.version}.0`.split(".");
      vi.removeStringValue({ lang: 1033, codepage: 1200 }, 'OriginalFilename');
      vi.removeStringValue({ lang: 1033, codepage: 1200 }, 'InternalName');
      vi.setProductVersion(theversion[0], theversion[1], theversion[2], theversion[3], 1033);
      vi.setFileVersion(theversion[0], theversion[1], theversion[2], theversion[3], 1033);
      vi.setStringValues(
        { lang: 1033, codepage: 1200 },
        {
          FileDescription: config.description,
          ProductName: config.name,
          CompanyName: config.company,
          LegalCopyright: config.copyright
        }
      );
      vi.outputToResourceEntries(res.entries);
      const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        1,
        1033,
        iconFile.icons.map((item) => item.data)
      );
      res.outputResource(exe);
      const newBinary = exe.generate();
      fs.writeFileSync(exePath, Buffer.from(newBinary));
      console.log("打包完成")
    }
  })
}
compile()




