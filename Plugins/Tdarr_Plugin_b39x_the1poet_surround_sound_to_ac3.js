const details = () => ({
  id: 'Tdarr_Plugin_b39x_the1poet_surround_sound_to_eac3_448k_cancel_ac3',
  Stage: 'Pre-processing',
  Name: 'The1poet Video Surround Sound To EAC3 448k (Cancel if AC3)',
  Type: 'Video',
  Operation: 'Transcode',
  Description: '[Contains built-in filter] If the file has surround sound tracks not in EAC3 or AC3,'
    + ` they will be converted to EAC3 with a bitrate of 448k. If the surround sound track is already AC3, the conversion will be canceled. \n\n`,
  Version: '1.04',
  Tags: 'pre-processing,ffmpeg,audio only,',
  Inputs: [
    {
      name: 'overwriteTracks',
      type: 'boolean',
      defaultValue: true,
      inputUI: {
        type: 'dropdown',
        options: [
          'false',
          'true',
        ],
      },
      tooltip: 'Specify if you\'d like to overwrite the existing track or keep'
        + ' it and have a new stream be created (default: true)',
    },
  ],
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
  const lib = require('../methods/lib')();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
  inputs = lib.loadDefaultValues(inputs, details);

  const response = {
    processFile: false,
    preset: '',
    container: '.mp4',
    handBrakeMode: false,
    FFmpegMode: false,
    reQueueAfter: false,
    infoLog: '',
  };

  if (file.fileMedium !== 'video') {
    // eslint-disable-next-line no-console
    console.log('File is not video');
    response.infoLog += '☒ File is not video \n';
    response.processFile = false;
    return response;
  }

  let audioIdx = -1;
  let ffmpegCommandInsert = '';
  let hasNonEAC3SurroundTrack = false;
  let hasAC3SurroundTrack = false;

  for (let i = 0; i < file.ffProbeData.streams.length; i += 1) {
    const currStream = file.ffProbeData.streams[i];
    try {
      if (currStream.codec_type.toLowerCase() === 'audio') {
        audioIdx += 1;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(err);
    }

    try {
      if (currStream.channels === 6 && currStream.codec_type.toLowerCase() === 'audio') {
        if (currStream.codec_name === 'ac3') {
          hasAC3SurroundTrack = true;
        } else if (currStream.codec_name !== 'eac3') {
          if (inputs.overwriteTracks === true) {
            ffmpegCommandInsert += ` -c:a:${audioIdx} eac3 -b:a:${audioIdx} 448k -metadata:s:a:${audioIdx} title= `;
          } else {
            ffmpegCommandInsert += `-map 0:a:${audioIdx} -c:a:${audioIdx} eac3 -b:a:${audioIdx} 448k -metadata:s:a:${audioIdx} title= `;
          }
          hasNonEAC3SurroundTrack = true;
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(err);
    }
  }

  if (hasAC3SurroundTrack) {
    response.infoLog += '☑ File has AC3 surround audio track(s), conversion canceled. \n';
    response.processFile = false;
    return response;
  }

  const ffmpegCommand = `,-map 0 -c:v copy  -c:a copy ${ffmpegCommandInsert} -c:s copy -c:d copy`;

  if (hasNonEAC3SurroundTrack) {
    response.processFile = true;
    response.preset = ffmpegCommand;
    response.container = `.${file.container}`;
    response.handBrakeMode = false;
    response.FFmpegMode = true;
    response.reQueueAfter = true;
    response.infoLog += '☒ File has surround audio which is NOT in EAC3, converting to EAC3. \n';
    return response;
  }

  response.infoLog += '☑ All surround audio streams are already in EAC3! \n';
  response.processFile = false;
  return response;
};

module.exports.details = details;
module.exports.plugin = plugin;