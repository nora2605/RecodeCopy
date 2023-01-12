const { join, extname } = require("path");
const path = require("path")
const { promises: fs } = require("fs");
const semaphore = require("semaphore");
const ffmpeg = require("fluent-ffmpeg");
const colors = require("colors");
const { argv } = require('process');

let concurrentProcessingLimit = 10;
let concurrentDirectoryCache = [];
const sem = semaphore(concurrentProcessingLimit);
let exclusions = [];
let inclusions = ['.png', '.jpg', 'jpeg', '.bmp', '.gif', '.tif'];
let target = '.mp3';
let recode = [".flac", ".ogg", ".wav", ".opus", ".mp3"];
let ffmpegoptions = ['-v 2'];
let overwrite = false;
let loglevel = 'default';
let ignore = true;

function abbreviate(p, maxchars = 20) {
  if (p.length <= maxchars) {
    return p;
  }

  const parts = path.parse(p);
  const dir = parts.dir.split(path.sep);
  let result = '';

  for (let i = 0; i < dir.length; i++) {
    const part = dir[i];
    if (result.length + part.length + 3 < maxchars) {
      result = path.join(result, part);
    } else {
      result = path.join(result, '...');
      break;
    }
  }

  return path.join(result, parts.base);
}

// Function that processes a file
const processFile = async (src, dest, file) => {
  const filePath = join(src, file);
  const ext = extname(file);
  if (!exclusions.some(e => file.includes(e)) && inclusions.concat(recode).concat([target]).includes(ext)) {
    if (!concurrentDirectoryCache.includes(dest)) {
      try {
        await fs.access(dest);
      } catch {
        if (loglevel == 'default' || loglevel == 'verbose') console.log(colors.italic.bold(`Created directory: ${dest}`));
        await fs.mkdir(dest, { recursive: true });
        concurrentDirectoryCache.push(dest);
      }
    }
    const finalDest = join(dest, recode.includes(ext) ? file.replace(ext, ".mp3") : file);
    if (overwrite) {
      await recodeFile(ext, filePath, finalDest);
    }
    else {
      try {
        await fs.access(finalDest);
        if (loglevel == 'default' || loglevel == 'verbose') console.log(colors.italic.yellow(`Skipped ${abbreviate(filePath)}`));
      } catch (e) {
        await recodeFile(ext, filePath, finalDest);
      }
    }
  }
};

async function recodeFile(ext, filePath, finalDest) {
  if (recode.includes(ext)) {
    await new Promise((resolve) => {
      sem.take(() => {
        ffmpeg()
          .input(filePath)
          .addOption('-y')
          .addOptions(ffmpegoptions)
          .output(finalDest)
          .on("error", (err) => {
            if (loglevel != 'quiet') console.log(colors.bold.red(`Error converting ${abbreviate(filePath)}: `) + colors.italic(`${err.message}`));
            if (!ignore) process.exit(1);
            sem.leave();
            resolve();
          })
          .on("end", () => {
            if (loglevel == 'default' || loglevel == 'verbose') console.log(colors.bold.green(`Successfully converted ${abbreviate(filePath)}`));
            sem.leave();
            resolve();
          })
          .on('progress', (progress) => {
            if (loglevel == 'verbose') console.log(`Converting ${abbreviate(filePath)}... ${progress.percent?.toFixed(1)}% done`.green.italic);
          })
          .run();
      });
    });
  } else {
    await fs.copyFile(filePath, finalDest);
    if (loglevel == 'default' || loglevel == 'verbose') console.log(colors.bold.blue(`Copied ${abbreviate(filePath)} to ${abbreviate(finalDest)}`));
  }
}

// The main function that processes a directory
async function processQueue(src, dest, rootSrc = src) {
  // Read the contents of the directory
  const files = await fs.readdir(src);
  // Process the files in parallel
  await Promise.all(
    files.map(async (file) => {
      const filePath = join(src, file);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          return processQueue(filePath, join(dest, file), rootSrc);
        } else {
          return processFile(src, dest, file);
        }
      } catch (e) {
        if (loglevel != 'quiet') console.log(colors.red(`\nError processing ${abbreviate(filePath)}: ${e.message}`));
        if (!ignore) process.exit(1);
        return null;
      }
    })
  );
}

const helpText = `${colors.rainbow('RecodeCopy Utility')}

${colors.green.bold(`Usage:`)}
${colors.italic(`(node) RecodeCopy(.js) {input path} {output Path} {options?}`)}

${colors.green.bold('Options:')}
-e, --exclusions {list}\t\t File signatures to exclude from processing. ${colors.yellow('default: None')}
-d, --target {file type}\t File type to recode to ${colors.yellow('default: .mp3')}
-r, --recoding-formats {list}\t File types to recode ${colors.yellow('default: .flac,.ogg,.opus,.wav,.mp3')}
-i, --inclusions {list}\t\t File types to simply copy ${colors.yellow('default: .png,.jpg,.jpeg,.gif,.tif,.jfif')}
--ffmpeg {arguments}   \t\t Manually pass arguments to ffmpeg, options seperated by | ${colors.yellow('default: -v 2')}
--overwrite            \t\t Choose to overwrite existent files ${colors.yellow('default: false')}
--log-level {quiet|error|verbose}What to display ${colors.yellow('default: default')}
--ignore-errors        \t\t Choose to ignore errors ${colors.yellow('default: true')}
--concurrent-processes \t\t Number of processes to be able to run at the same time (ffmpeg) ${colors.yellow('default: 10')}

${colors.green.bold('Examples:')}
Recode all audio files from C:\\Users\\Public\\Music to C:\\Users\\Public\\Music\\mp3library to mp3 while copying album arts
\t${colors.cyan.italic('(node) RecodeCopy(.js) C:\\Users\\Public\\Music C:\\Users\\Public\\Music\\mp3library')}
Only copy all flac audio files from ~ to ~/flac, with album arts.
\t${colors.cyan.italic('(node) RecodeCopy(.js) ~ ~/flac -d .flac -r -')}
Recode all from ~ to ~/onlyaudd to flac, level 5, only audio.
\t${colors.cyan.italic('(node) RecodeCopy(.js) ~ ~/onlyaudd -d .flac -i - --fmpeg "-compression_level 5|-c:a libflac"')}

Hint: Specify the target in the recoding formats to not copy but recode the file with a consistent bitrate!
`;

if (!argv[2]) {
  console.error(colors.bold.red(`Insufficient arguments, use --help or -h for more info.`));
  process.exit(1);
}
if (argv[2].includes('help') || argv[2] === '-h') {
  console.log(helpText);
  process.exit(0);
}
if (argv.length < 4) {
  console.error(colors.bold.red(`Insufficient arguments, use --help or -h for more info.`));
  process.exit(1);
}

if (argv.length > 4) {
  for (let args = argv.slice(4), i = 0; i < args.length; i += 2) {
    let arg = args[i];
    let val = args[i + 1];
    if (val === null) {
      console.error(colors.bold.red(`No value for the ${arg} argument`));
      process.exit(1);
    }
    switch (arg) {
      case '-e':
      case '--exclusions':
        if (val === '-') {
          exclusions = [];
          continue;
        }
        exclusions = val.split(',');
        break;
      case '--ffmpeg':
        if (val === '-') {
          ffmpegoptions = [];
          continue;
        }
        ffmpegoptions = val.split('|');
        break;
      case '--overwrite':
        if (val.toLowerCase() === 'true') overwrite = true;
        else if (val.toLowerCase() === 'false') overwrite = false;
        else {
          console.error(colors.bold.red(`Invalid value for --overwrite, must be either true or false`));
          process.exit(1);
        }
        break;
      case '-d':
      case '--target':
        if (!val) {
          console.error(colors.bold.red('Empty string given for target'));
          process.exit(1);
        }
        target = val;
        if (!target.startsWith('.')) {
          console.error(colors.bold.red(`Target: Invalid format, file types need to start with a dot`));
          process.exit(1);
        }
        break;
      case '-l':
      case '--log-level':
        if (!val) {
          console.error(colors.bold.red('Empty string given for log-level'));
          process.exit(1);
        }
        loglevel = val.toLowerCase();
        if (!['default', 'quiet', 'error', 'verbose'].includes(loglevel)) {
          console.error(colors.bold.red(`Log Level must be one of default | quiet | error | verbose`));
          process.exit(1);
        }
        break;
      case '-r':
      case '--recoding-formats':
        if (val === '-') {
          recode = [];
          continue;
        }
        recode = val.split(',');
        if (recode.some(x => !x.startsWith('.'))) {
          console.error(colors.bold.red(`Recode: Invalid format, file types need to start with a dot`));
          process.exit(1);
        }
        break;
      case '-i':
      case '--inclusions':
        if (val === '-') {
          inclusions = [];
          break;
        }
        inclusions = val.split(',');
        if (inclusions.some(x => !x.startsWith('.'))) {
          console.error(colors.bold.red(`Include: Invalid format, file types need to start with a dot`));
          process.exit(1);
        }
        break;
      case '--ignore-errors':
        if (val.toLowerCase() === 'true') ignore = true;
        else if (val.toLowerCase() === 'false') ignore = false;
        else {
          console.error(colors.bold.red(`Invalid value for --ignore-errors, must be either true or false`));
          process.exit(1);
        }
        break;
      case '--concurrent-processes':
        try {
          if (!parseInt(val)) throw Error();
          concurrentProcessingLimit = parseInt(val);
        } catch {
          console.error(colors.bold.red(`Invalid value for --concurrent-processes, must be an integer`));
          process.exit(1);
        }
        break;
      default:
        console.error(colors.bold.red(`Invalid option: ${arg}`));
        process.exit(1);
    }
  }
}

processQueue(argv[2], argv[3]).then(() => {
  console.log("Processing completed.");
});