/* eslint-env mocha */
const path = require('path')
const nock = require('nock')
const alexaTest = require('alexa-skill-test-framework')

const AWSMOCK = require('aws-sdk-mock')
AWSMOCK.mock('DynamoDB', 'createTable', (params, callback) => {
  console.log('MOCK createTable:', params)
  callback(null, {})
})
AWSMOCK.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
  console.log('MOCK get:', params)
  switch (params.TableName) {
    case 'persistent-store-test':
      callback(null, {
        Item: {
          id: 'hoge',
          attributes: {
            offsetByUrl: {
              'https://example.com/hoge.mp3': 12345
            }
          }
        }
      })
      break
    case 'alexa-skill-podcasts-player':
      callback(null, {
        Item: {
          podcastId: 'hoge',
          timeStamp: 1234567,
          episodes: undefined,
          headers: {
            etag: '"abcdef1234567890"'
          }
        }
      })
      break
    default:
      callback(null, {})
  }
})
AWSMOCK.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
  console.log('MOCK put:', params)
  callback(null, {})
})


alexaTest.initialize(
  require('../index.js'),
  'amzn1.ask.skill.00000000-0000-0000-0000-000000000000',
  'amzn1.ask.account.LONG_STRING',
  'amzn1.ask.device.LONG_STRING'
)
alexaTest.setLocale('ja-JP')

beforeEach(() => {
  // RSSフィードの読み込みをMockに差し替える
  nock('https://feeds.turingcomplete.fm')
    .head('/tcfm')
    .times(2)
    .reply(200, '', {
      'ETag': '__etag__'
    })

  nock('https://feeds.turingcomplete.fm')
    .get('/tcfm')
    .replyWithFile(200, path.join(__dirname, '/replies/tcfm'), { 'Content-Type': 'text/xml; charset=UTF-8' })
})

// alexaTest.setDynamoDBTable('alexa-skill-podcasts-player')

describe('スキル起動時', () => {
  alexaTest.test([
    {
      request: alexaTest.getLaunchRequest(),
      saysLike: 'チューリングコンプリートエフエム の最新エピソード',
      repromptsNothing: true,
      shouldEndSession: true,
      playsStream: {
        behavior: 'REPLACE_ALL',
        token: 'turingcomplete.fm:0',
        url: 'https://tracking.feedpress.it/link/18928/9899277/29.mp3',
        offset: 0
      }
    }
  ])
})

describe('最新エピソードの再生を指示', () => {
  alexaTest.test([
    {
      request: alexaTest.getIntentRequest('PlayPodcastIntent'),
      saysLike: 'チューリングコンプリートエフエム の最新エピソード',
      repromptsNothing: true,
      shouldEndSession: true,
      playsStream: {
        behavior: 'REPLACE_ALL',
        token: 'turingcomplete.fm:0',
        url: 'https://tracking.feedpress.it/link/18928/9899277/29.mp3',
        offset: 0
      }
    }
  ])
})

describe('番号指定でエピソードを再生', () => {
  context('上限以内の場合', () => {
    alexaTest.test([
      {
        request: alexaTest.getIntentRequest('PlayPodcastByIndexIntent', { indexOfEpisodes: 3 }),
        saysLike: 'チューリングコンプリートエフエム の 3 番目のエピソード',
        repromptsNothing: true,
        shouldEndSession: true,
        playsStream: {
          behavior: 'REPLACE_ALL',
          token: 'turingcomplete.fm:2',
          url: 'https://tracking.feedpress.it/link/18928/9753933/27.mp3',
          offset: 0
        }
      }
    ])
  })

  context('0番目が指定された場合', () => {
    alexaTest.test([
      {
        request: alexaTest.getIntentRequest('PlayPodcastByIndexIntent', { indexOfEpisodes: 0 }),
        saysLike: 'エピソードの番号は1から100までの数字で指定してください。',
        repromptsLike: '何番目のエピソードが聴きたいですか？',
        repromptsNothing: false,
        shouldEndSession: false
      }
    ])
  })

  context('101番目が指定された場合', () => {
    alexaTest.test([
      {
        request: alexaTest.getIntentRequest('PlayPodcastByIndexIntent', { indexOfEpisodes: 0 }),
        saysLike: 'エピソードの番号は1から100までの数字で指定してください。',
        repromptsLike: '何番目のエピソードが聴きたいですか？',
        repromptsNothing: false,
        shouldEndSession: false
      }
    ])
  })

  context('不明な番号が指定された場合', () => {
    alexaTest.test([
      {
        request: alexaTest.getIntentRequest('PlayPodcastByIndexIntent', { indexOfEpisodes: '?' }),
        saysLike: 'エピソードの番号は1から100までの数字で指定してください',
        repromptsLike: '何番目のエピソードが聴きたいですか？',
        repromptsNothing: false,
        shouldEndSession: false
      }
    ])
  })
})

describe('先頭からを指示', () => {
  const request = alexaTest.getIntentRequest('AMAZON.StartOverIntent')
  alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:2', 1000)

  alexaTest.test([
    {
      request,
      saysLike: '先頭から再生します',
      shouldEndSession: true,
      playsStream: {
        behavior: 'REPLACE_ALL',
        token: 'turingcomplete.fm:2',
        url: 'https://tracking.feedpress.it/link/18928/9753933/27.mp3',
        offset: 0
      }
    }
  ])
})

describe('早送り', () => {
  context('正しい分数が指定されている場合', () => {
    const request = alexaTest.getIntentRequest('FastforwardIntent', { 'skipMinutes': 5 })
    alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:0', 60000)

    alexaTest.test([
      {
        request,
        saysLike: '5分進めます',
        shouldEndSession: true,
        playsStream: {
          behavior: 'REPLACE_ALL',
          token: 'turingcomplete.fm:0',
          url: 'https://tracking.feedpress.it/link/18928/9899277/29.mp3',
          offset: 360000
        }
      }
    ])
  })

  context('不正な数が指定されている場合', () => {
    const invalidRequest = alexaTest.getIntentRequest('FastforwardIntent', { 'skipMinutes': '?' })
    alexaTest.addAudioPlayerContextToRequest(invalidRequest, 'turingcomplete.fm:0', 60000)

    alexaTest.test([
      {
        request: invalidRequest,
        saysLike: 'ごめんなさい、よく理解できませんでした',
        repromptsNothing: true,
        shouldEndSession: true
      }
    ])
  })

  context('再生中ではない場合', () => {
    const request = alexaTest.getIntentRequest('FastforwardIntent', { 'skipMinutes': 5 })

    alexaTest.test([
      {
        request,
        saysLike: 'その操作はエピソードを再生中の場合のみ可能です',
        shouldEndSession: true
      }
    ])
  })
})

describe('巻き戻し', () => {
  const request = alexaTest.getIntentRequest('RewindIntent', { 'skipMinutes': 5 })
  alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:0', 360000)

  alexaTest.test([
    {
      request,
      saysLike: '5分戻ります',
      shouldEndSession: true,
      playsStream: {
        behavior: 'REPLACE_ALL',
        token: 'turingcomplete.fm:0',
        url: 'https://tracking.feedpress.it/link/18928/9899277/29.mp3',
        offset: 60000
      }
    }
  ])

  context('不正な数が指定されている場合', () => {
    const invalidRequest = alexaTest.getIntentRequest('RewindIntent', { 'skipMinutes': '?' })
    alexaTest.addAudioPlayerContextToRequest(invalidRequest, 'turingcomplete.fm:0', 360000)

    alexaTest.test([
      {
        request: invalidRequest,
        saysLike: 'ごめんなさい、よく理解できませんでした',
        repromptsNothing: true,
        shouldEndSession: true
      }
    ])
  })

  context('再生中ではない場合', () => {
    const request = alexaTest.getIntentRequest('RewindIntent', { 'skipMinutes': 5 })

    alexaTest.test([
      {
        request,
        saysLike: 'その操作はエピソードを再生中の場合のみ可能です',
        shouldEndSession: true
      }
    ])
  })
})

describe('ヘルプ', () => {
  alexaTest.test([
    {
      request: alexaTest.getIntentRequest('AMAZON.HelpIntent'),
      saysLike: 'チューリングコンプリートエフエムで配信中の最新から100番目のエピソードを聴くことができます',
      repromptsLike: '何番目のエピソードが聴きたいですか？',
      shouldEndSession: false,
      hasCardTitle: 'Turing Complete FM プレイヤーについて'
    }
  ])
})

describe('キャンセル', () => {
  const intents = [
    'AMAZON.CancelIntent',
    'AMAZON.StopIntent',
    'AMAZON.PauseIntent'
  ]

  intents.forEach((intent) => {
    context(`インテントが ${intent}`, () => {
      context('再生中', () => {
        const request = alexaTest.getIntentRequest(intent)
        alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:0', 60000, 'PLAYING')

        alexaTest.test([
          {
            request,
            saysNothing: true,
            repromptsNothing: true,
            shouldEndSession: true,
            stopStream: true
          }
        ])
      })

      context('停止中', () => {
        const request = alexaTest.getIntentRequest(intent)
        alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:0', 60000, 'PAUSED')

        alexaTest.test([
          {
            request,
            saysLike: '停止します',
            repromptsNothing: true,
            shouldEndSession: true,
            stopStream: true
          }
        ])
      })
    })
  })
})

describe('レジューム', () => {
  const request = alexaTest.getIntentRequest('AMAZON.ResumeIntent')
  alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:0', 60000, 'PAUSED')

  alexaTest.test([
    {
      request,
      saysNothing: true,
      shouldEndSession: true,
      playsStream: {
        behavior: 'REPLACE_ALL',
        token: 'turingcomplete.fm:0',
        url: 'https://tracking.feedpress.it/link/18928/9899277/29.mp3',
        offset: 60000
      }
    }
  ])
})

describe('次へ', () => {
  context('最後のエピソードではない', () => {
    const request = alexaTest.getIntentRequest('AMAZON.NextIntent')
    alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:0', 60000, 'PLAYING')

    alexaTest.test([
      {
        request,
        saysLike: '2番目のエピソード',
        shouldEndSession: true,
        playsStream: {
          behavior: 'REPLACE_ALL',
          token: 'turingcomplete.fm:1',
          url: 'https://tracking.feedpress.it/link/18928/9839508/28.mp3',
          offset: 0
        }
      }
    ])
  })

  context('最後のエピソード', () => {
    const request = alexaTest.getIntentRequest('AMAZON.NextIntent')
    alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:99', 60000, 'PLAYING')

    alexaTest.test([
      {
        request,
        saysLike: '次のエピソードはありません',
        shouldEndSession: true,
        playsStoped: true
      }
    ])
  })
})

describe('前へ', () => {
  context('最初のエピソードではない', () => {
    const request = alexaTest.getIntentRequest('AMAZON.PreviousIntent')
    alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:1', 60000, 'PLAYING')

    alexaTest.test([
      {
        request,
        saysLike: '1番目のエピソード',
        shouldEndSession: true,
        playsStream: {
          behavior: 'REPLACE_ALL',
          token: 'turingcomplete.fm:0',
          url: 'https://tracking.feedpress.it/link/18928/9899277/29.mp3',
          offset: 0
        }
      }
    ])
  })

  context('最初のエピソード', () => {
    const request = alexaTest.getIntentRequest('AMAZON.PreviousIntent')
    alexaTest.addAudioPlayerContextToRequest(request, 'turingcomplete.fm:0', 60000, 'PLAYING')

    alexaTest.test([
      {
        request,
        saysLike: '前のエピソードはありません',
        repromptsNothing: true,
        shouldEndSession: true,
        playsStoped: true
      }
    ])
  })
})

describe('対応していない操作', () => {
  const intents = [
    'AMAZON.LoopOnIntent',
    'AMAZON.LoopOffIntent',
    'AMAZON.RepeatIntent',
    'AMAZON.ShuffleOnIntent',
    'AMAZON.ShuffleOffIntent'
  ]

  intents.forEach((intent) => {
    context(intent, () => {
      alexaTest.test([
        {
          request: alexaTest.getIntentRequest(intent),
          saysLike: 'その操作には対応していません',
          repromptsNothing: true,
          shouldEndSession: true
        }
      ])
    })
  })
})

describe('AudioPlayerEvent', () => {
  it('PlaybackStarted')
  it('PlaybackNealyFinished')
})

describe('セッション終了', () => {
  it('session ended')
})

describe('エラー', () => {
  it('error')
})
