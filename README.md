# RecodeCopy

Amazing utility for converting a whole music library to a single format, copying it, and managing the arts and scans and whatever
A local FFMpeg installation is required.

### **RecodeCopy Utility**

#### **Usage:**
(node) RecodeCopy(.js) {input path} {output Path} {options?}
(node) RecodeCopy(.js) --help|-h|help

#### **Options:**
-e, --exclusions {list}\t\t File signatures to exclude from processing. default: None
-d, --target {file type}\t File type to recode to default: .mp3
-r, --recoding-formats {list}\t File types to recode default: .flac,.ogg,.opus,.wav,.mp3
-i, --inclusions {list}\t\t File types to simply copy default: .png,.jpg,.jpeg,.gif,.tif,.jfif
--ffmpeg {arguments}   \t\t Manually pass arguments to ffmpeg, options seperated by | default: -v 2
--overwrite            \t\t Choose to overwrite existent files default: false
--log-level {quiet|error|verbose}What to display default: default
--ignore-errors        \t\t Choose to ignore errors default: true
--concurrent-processes \t\t Number of processes to be able to run at the same time (ffmpeg) default: 10

#### **Examples:**
Recode all audio files from C:\\Users\\Public\\Music to C:\\Users\\Public\\Music\\mp3library to mp3 while copying album arts
    (node) RecodeCopy(.js) C:\\Users\\Public\\Music C:\\Users\\Public\\Music\\mp3library
Only copy all flac audio files from ~ to ~/flac, with album arts.
    (node) RecodeCopy(.js) ~ ~/flac -d .flac -r -
Recode all from ~ to ~/onlyaudd to flac, level 5, only audio.
    (node) RecodeCopy(.js) ~ ~/onlyaudd -d .flac -i - --fmpeg "-compression_level 5|-c:a libflac"

Hint: Specify the target in the recoding formats to not copy but recode the file with a consistent bitrate!