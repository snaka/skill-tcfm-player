const podcast = require('podcast')

exports.handler = async (event) => {
  const episode = await podcast.getEpisodeInfo(podcast.config.ID, 0)
}
