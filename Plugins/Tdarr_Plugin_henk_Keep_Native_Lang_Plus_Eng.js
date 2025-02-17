/* eslint-disable no-await-in-loop */
module.exports.dependencies = ['axios@0.27.2', '@cospired/i18n-iso-languages'];

const details = () => ({
  id: 'Tdarr_Plugin_henk_Keep_Native_Lang_Plus_Eng',
  Stage: 'Pre-processing',
  Name: 'Remove all langs except native and English',
  Type: 'Audio',
  Operation: 'Transcode',
  Description: `This is a modified version made by gsariev of the original plugin. This plugin will remove all language audio tracks except the 'native' and user-specified languages.
     (requires TMDB api key).
    'Native' languages are the ones that are listed on TMDB. It does an API call to 
    Radarr, Sonarr to check if the movie/series exists and grabs the IMDb id. As a last resort, it 
    falls back to the IMDb id in the filename.`,
  Version: '1.3', // Incremented version
  Tags: 'pre-processing,configurable',
  Inputs: [
    {
      name: 'user_langs',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip:
        'Input a comma-separated list of ISO-639-2 languages. It will still keep English and undefined tracks.'
        + '(https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes 639-2 column)'
        + '\\nExample:\\n'
        + 'ger,fre',
    },
    {
      name: 'priority',
      type: 'string',
      defaultValue: 'radarr',
      inputUI: {
        type: 'text',
      },
      tooltip:
        'Priority for either Radarr or Sonarr. Leaving it empty defaults to Radarr first.'
        + '\\nExample:\\n'
        + 'sonarr',
    },
    {
      name: 'api_key',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip:
        'Input your TMDB api (v3) key here. (https://www.themoviedb.org/)',
    },
    {
      name: 'radarr_api_key',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your Radarr api key here.',
    },
    {
      name: 'radarr_url',
      type: 'string',
      defaultValue: '192.168.1.2:7878',
      inputUI: {
        type: 'text',
      },
      tooltip:
        'Input your Radarr url here. (Without http://). Do include the port.'
        + '\\nExample:\\n'
        + '192.168.1.2:7878',
    },
    {
      name: 'sonarr_api_key',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your Sonarr api key here.',
    },
    {
      name: 'sonarr_url',
      type: 'string',
      defaultValue: '192.168.1.2:8989',
      inputUI: {
        type: 'text',
      },
      tooltip:
        'Input your Sonarr url here. (Without http://). Do include the port.'
        + '\\nExample:\\n'
        + '192.168.1.2:8989',
    },
    {
      name: 'commentary',
      type: 'boolean',
      defaultValue: false,
      inputUI: {
        type: 'dropdown',
        options: [
          'false',
          'true',
        ],
      },
      tooltip: `Specify if audio tracks that contain commentary/description should be kept.
               \\nExample:\\n
               true

               \\nExample:\\n
               false`,
    },
    {
      name: 'undefined_lang_tag',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip:
        'Specify the language tag to use for undefined audio tracks. If empty, the original language tag will be used.',
    },
  ],
});

const response = {
  processFile: false,
  preset: '',
  container: '.',
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: false,
  infoLog: '',
};

const languageConverter = (tmdbLanguageCode) => {
  const isoLang = require('@cospired/i18n-iso-languages');

  try {
    // Convert TMDB language code to ISO-639-2 3-letter format
    const convertedLanguageCode = isoLang.alpha2ToAlpha3B(tmdbLanguageCode);

    // Log the converted language code
    response.infoLog += `TMDB Language Code Return: ${convertedLanguageCode}\n`;

    return convertedLanguageCode;
  } catch (error) {
    console.error('Error converting language code:', error.message);
    response.infoLog += '☒Error converting language code.\n';
    return null;
  }
};

const parseArrResponse = (body, filePath, arr) => {
  // eslint-disable-next-line default-case
  switch (arr) {
    case 'radarr':
      return body.movie;
    case 'sonarr':
      return body.series;
  }
};

const processStreams = (result, file, userLangs, isSonarr, includeCommentary, undefinedLangTag) => {
  const languages = require('@cospired/i18n-iso-languages');
  const tracks = {
    keep: [],
    remove: [],
    remLangs: '',
    metadata: '',
  };
  let streamIndex = 0;
  let shouldProcess = false;

  // Convert the TMDB language code to ISO-639-2 3-letter format dynamically
  const tmdbLanguageCode = result.original_language;
  const convertedLanguageCode = languageConverter(tmdbLanguageCode) || tmdbLanguageCode;

  response.infoLog += `Original language tag: ${convertedLanguageCode}\n`;

  // Flag to indicate if any audio track matches the specified languages
  let matchFound = false;

  for (const stream of file.ffProbeData.streams) {
    if (stream.codec_type === 'audio') {
      if (!stream.tags || !stream.tags.language || stream.tags.language.toLowerCase() === 'und') {
        // Explicitly identify undefined tracks
        const tagLanguage = undefinedLangTag || convertedLanguageCode;
        response.infoLog += `☒No language tag found on audio track ${streamIndex}. Tagging it with ${tagLanguage}.\n`;
        // Tag the undefined audio track
        tracks.metadata += `-metadata:s:a:${streamIndex} language=${tagLanguage} `;
        tracks.keep.push(streamIndex);
        response.infoLog += `☑Tagged audio track ${streamIndex} with ${tagLanguage}\n`;
        matchFound = true; // Consider this a match since we are tagging it appropriately
        shouldProcess = true; // Mark the file to be processed
      } else if (stream.tags.title && isCommentaryTrack(stream.tags.title)) {
        // Remove commentary tracks if includeCommentary is false
        if (!includeCommentary) {
          response.infoLog += `☒Removing commentary audio track: ${languages.getName(stream.tags.language, 'en')} (commentary) - ${stream.tags.title}\n`;
          tracks.remove.push(streamIndex);
          tracks.remLangs += `${languages.getName(stream.tags.language, 'en')} (commentary), `;
          shouldProcess = true; // Mark the file to be processed
        } else {
          tracks.keep.push(streamIndex);
          response.infoLog += `☑Keeping commentary audio track: ${languages.getName(stream.tags.language, 'en')} (commentary) - ${stream.tags.title}\n`;
          matchFound = true; // At least one track matches the specified languages
        }
      } else if (stream.tags.language) {
        // Check if the language is in the user-defined languages or it's the original language
        const mappedLanguage = isSonarr ? mapSonarrLanguageToTMDB(stream.tags.language) : mapRadarrLanguageToTMDB(stream.tags.language);
        
        if (userLangs.includes(mappedLanguage) || mappedLanguage === convertedLanguageCode) {
          tracks.keep.push(streamIndex);
          response.infoLog += `☑Keeping audio track with language: ${languages.getName(stream.tags.language, 'en')}\n`;
          matchFound = true; // At least one track matches the specified languages
        } else {
          response.infoLog += `☒Removing audio track with language: ${languages.getName(stream.tags.language, 'en')}\n`;
          tracks.remove.push(streamIndex);
          tracks.remLangs += `${languages.getName(stream.tags.language, 'en')}, `;
          shouldProcess = true; // Mark the file to be processed
        }
      }

      streamIndex += 1;
    }
  }

  // If no tracks are found to match the specified languages and none are kept, stop the plugin
  if (!matchFound && tracks.keep.length === 0) {
    response.infoLog += '☒Cancelling plugin because none of the audio tracks match the specified languages or are tagged as undefined. \n';
    response.processFile = false;

    // Clear the removal tracks to prevent further deletion
    tracks.remove = [];
  } else {
    response.processFile = shouldProcess; // Process the file if at least one track is kept or tagged
  }

  if (shouldProcess) {
    response.preset = `, -map 0:v -c:v copy `;
    for (const index of tracks.keep) {
      response.preset += `-map 0:a:${index} `;
    }
    for (const index of tracks.remove) {
      response.preset += `-map -0:a:${index} `;
    }
    response.preset += `${tracks.metadata} -c:a copy -max_muxing_queue_size 9999`;
  }

  return tracks;
};

const mapRadarrLanguageToTMDB = (radarrLanguage) => {
  const languageMappings = {
    chi: 'cn',
    // Add additional mapping if needed
  };

  return languageMappings[radarrLanguage] || radarrLanguage;
};

const mapSonarrLanguageToTMDB = (sonarrLanguage) => {
  const languageMappings = {
    // Add mappings for Sonarr languages if needed
  };

  return languageMappings[sonarrLanguage] || sonarrLanguage;
};

const tmdbApi = async (filename, api_key, axios) => {
  let fileName;

  if (filename) {
    if (filename.slice(0, 2) === 'tt') {
      fileName = filename;
    } else {
      const idRegex = /(tt\d{7,8})/;
      const fileMatch = filename.match(idRegex);

      if (fileMatch) {
        fileName = fileMatch[1];
      }
    }
  }

  if (fileName) {
    try {
      const result = await axios
        .get(
          `https://api.themoviedb.org/3/find/${fileName}?api_key=`
          + `${api_key}&language=en-US&external_source=imdb_id`,
        )
        .then((resp) => (resp.data.movie_results.length > 0
          ? resp.data.movie_results[0]
          : resp.data.tv_results[0]));

      console.log('TMDB API Result:', result);

      if (!result) {
        response.infoLog += '☒No IMDb result was found. \n';
      }

      if (result) {
        const tmdbLanguageCode = languageConverter(result.original_language);

        response.infoLog += `Converted TMDB Language Code: ${tmdbLanguageCode}\n`;
        response.infoLog += `Language tag picked up by TMDB: ${tmdbLanguageCode}\n`;
      } else {
        response.infoLog += "☒Couldn't find the IMDb id of this file. Skipping. \n";
      }

      return result;
    } catch (error) {
      console.error('Error fetching data from TMDB API:', error.message);
      response.infoLog += '☒Error fetching data from TMDB API.\n';
      return null;
    }
  }

  return null;
};

const isCommentaryTrack = (title) => {
  // Check if the title includes keywords indicating a commentary track
  return title.toLowerCase().includes('commentary')
    || title.toLowerCase().includes('description')
    || title.toLowerCase().includes('sdh')
    || title.toLowerCase().includes('kommentarspor');
};

const plugin = async (file, librarySettings, inputs, otherArguments) => {
  const lib = require('../methods/lib')();
  const axios = require('axios').default;

  inputs = lib.loadDefaultValues(inputs, details);

  response.container = `.${file.container}`;
  let prio = ['radarr', 'sonarr'];
  let radarrResult = null;
  let sonarrResult = null;
  let tmdbResult = null;

  if (inputs.priority && inputs.priority === 'sonarr') {
    prio = ['sonarr', 'radarr'];
  }

  const fileNameEncoded = encodeURIComponent(file.meta.FileName);

  for (const arr of prio) {
    let imdbId;

    // Reset infoLog before each processing step (removes duplicated logs being displayed)
    response.infoLog = '';

    switch (arr) {
      case 'radarr':
        if (tmdbResult) break;
        if (inputs.radarr_api_key) {
          radarrResult = parseArrResponse(
            await axios
              .get(
                `http://${inputs.radarr_url}/api/v3/parse?apikey=${inputs.radarr_api_key}&title=${fileNameEncoded}`,
              )
              .then((resp) => resp.data),
            fileNameEncoded,
            'radarr',
          );

          if (radarrResult) {
            imdbId = radarrResult.imdbId;
            response.infoLog += `Grabbed ID (${imdbId}) from Radarr \n`;

            const radarrLanguageTag = radarrResult.originalLanguage.name;
            response.infoLog += `Language tag picked up by Radarr: ${radarrLanguageTag}\n`;

            tmdbResult = await tmdbApi(imdbId, inputs.api_key, axios);

            if (tmdbResult) {
              const tmdbLanguageTag = languageConverter(tmdbResult.original_language) || tmdbResult.original_language;
              response.infoLog += `Language tag picked up by TMDB: ${tmdbLanguageTag}\n`;
            }
          } else {
            response.infoLog += "Couldn't grab ID from Radarr \n";
            imdbId = fileNameEncoded;
            tmdbResult = await tmdbApi(imdbId, inputs.api_key, axios);

            if (tmdbResult) {
              const tmdbLanguageTag = languageConverter(tmdbResult.original_language) || tmdbResult.original_language;
              response.infoLog += `Language tag picked up by TMDB: ${tmdbLanguageTag}\n`;
            }
          }
        }
        break;
      case 'sonarr':
        if (tmdbResult) break;
        if (inputs.sonarr_api_key) {
          sonarrResult = parseArrResponse(
            await axios.get(
              `http://${inputs.sonarr_url}/api/v3/parse?apikey=${inputs.sonarr_api_key}&title=${fileNameEncoded}`,
            )
              .then((resp) => resp.data),
            file.meta.Directory,
            'sonarr',
          );

          if (sonarrResult) {
            imdbId = sonarrResult.imdbId;
            response.infoLog += `Grabbed ID (${imdbId}) from Sonarr \n`;

            tmdbResult = await tmdbApi(imdbId, inputs.api_key, axios);

            if (tmdbResult) {
              const sonarrTracks = processStreams(tmdbResult, file, inputs.user_langs ? inputs.user_langs.split(',') : '', true, inputs.commentary, inputs.undefined_lang_tag);

              if (sonarrTracks.remove.length > 0) {
                if (sonarrTracks.keep.length > 0) {
                  response.infoLog += `☑Removing tracks with languages: ${sonarrTracks.remLangs.slice(
                     0,
                     -2,
                  )}. \n`;
                  response.processFile = true;
                  response.infoLog += '\n';
                } else {
                  response.infoLog
                    += '☒Cancelling plugin otherwise all audio tracks would be removed. \n';
                }
              } else {
                response.infoLog += '☒No audio tracks to be removed. \n';
              }
            } else {
              response.infoLog += "☒Couldn't find the IMDb id of this file. Skipping. \n";
            }
          }
        }
        break;
    }
  }

  if (tmdbResult) {
    const userLanguages = inputs.user_langs ? inputs.user_langs.split(',') : [];
    const originalLanguage = tmdbResult.original_language;
    const originalLanguageIncluded = userLanguages.includes(originalLanguage);

    const tracks = processStreams(
      tmdbResult,
      file,
      userLanguages,
      false,
      inputs.commentary,
      inputs.undefined_lang_tag,
    );

    console.log('Tracks:', tracks);
    console.log('Original Language:', originalLanguage);
    console.log('User Languages:', userLanguages);
    console.log('Original Language Included:', originalLanguageIncluded);
    console.log('User Languages Include Removed Languages:', userLanguages.includes(tracks.remLangs));

    // Check if no tracks match original or user-specified languages
    const noMatchingTracks = tracks.keep.length === 0 && !originalLanguageIncluded && !userLanguages.includes(tracks.remLangs);

    console.log('No Matching Tracks:', noMatchingTracks);

    if (noMatchingTracks) {
      response.infoLog += '☒Cancelling plugin because no audio tracks match the original language or user-specified languages. \n';
      return response; // Stop execution
    }

    // Continue processing audio tracks
    if (tracks.remove.length > 0) {
      if (tracks.keep.length > 0) {
        response.infoLog += `☑Removing tracks with languages: ${tracks.remLangs.slice(
          0,
          -2,
        )}. \n`;
        response.processFile = true;
        response.infoLog += '\n';
      } else {
        response.infoLog += '☒Cancelling plugin otherwise all audio tracks would be removed. \n';
      }
    } else {
      response.infoLog += '☒No audio tracks to be removed. \n';
    }
  } else {
    response.infoLog += "☒Couldn't find the IMDb id of this file. Skipping. \n";
  }

  return response;
};

module.exports.details = details;
module.exports.plugin = plugin;