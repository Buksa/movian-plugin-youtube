var api = require('./api');
var popup = require('showtime/popup');

var iso8601DurationRegex = /(-)?P(?:([\.,\d]+)Y)?(?:([\.,\d]+)M)?(?:([\.,\d]+)W)?(?:([\.,\d]+)D)?T(?:([\.,\d]+)H)?(?:([\.,\d]+)M)?(?:([\.,\d]+)S)?/;

function parseISO8601Duration(s) {
  var m = s.match(iso8601DurationRegex);

  return (m[8] === undefined ? 0 : m[8]) * 1 +
    (m[7] === undefined ? 0 : m[7]) * 60 +
    (m[6] === undefined ? 0 : m[6]) * 3600 +
    (m[5] === undefined ? 0 : m[5]) * 86400;
};


function trimlf(s) {
  return s.replace(/(\r\n|\n|\r)/gm," ");
}

var channelImageSetSizes = {
  'default': {
    width: 88,
    height: 88
  },
  'medium': {
    width: 240,
    height: 240
  },
  'high': {
    width: 800,
    height: 800
  }
}

var videoImageSetSizes = {
  'default': {
    width: 120,
    height: 90
  },
  'medium': {
    width: 320,
    height: 180
  },
  'high': {
    width: 480,
    height: 360
  }
}


function makeImageSet(thumbnails, sizemap) {
  var images = [];
  for(var k in thumbnails) {
    var v = thumbnails[k];
    if(!v.width && !v.height) {
      images.push({
        url: v.url,
        width: sizemap[k].width,
        height: sizemap[k].height,
      });
    } else {
      images.push({
        url: v.url,
        width: v.width,
        height: v.height,
      });
    }
  }
  return 'imageset:' + JSON.stringify(images);
}

function populatePageFromResults(page, result) {
  var items = {};
  var allvideos = [];

  for(var i = 0; i < result.items.length; i++) {

    var item = result.items[i];
    var URI;

    switch(item.kind) {
    case 'youtube#playlistItem':
      var vid = item.snippet.resourceId.videoId;
      URI = PREFIX + ":video:" + vid;
      allvideos.push(vid);
      items[vid] = page.appendItem(URI, 'video', {
        title: item.snippet.title,
        icon: 'http://i.ytimg.com/vi/'+vid+'/mqdefault.jpg',
        //icon: makeImageSet(item.snippet.thumbnails, videoImageSetSizes),
        description: trimlf(item.snippet.description),
		genre: "Date: "+item.snippet.publishedAt.substr(0,10),
		tagline: "Added: "+item.snippet.publishedAt.substr(0,10),
      });
      break;

    case 'youtube#searchResult':

      switch(item.id.kind) {
      case 'youtube#playlist':
        page.appendItem(PREFIX + ":playlist:" + item.id.playlistId + ":" + item.snippet.channelId, 'playlist', {
          title: item.snippet.title,
          icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails),
        });
        break;

      case 'youtube#video':
		URI = PREFIX + ":video:" + item.id.videoId;
		allvideos.push(item.id.videoId);
		items[item.id.videoId] = page.appendItem(URI, 'video', {
			title: item.snippet.title,
			icon: 'http://i.ytimg.com/vi/'+item.id.videoId+'/mqdefault.jpg', //makeImageSet(item.snippet.thumbnails, videoImageSetSizes),
			description: trimlf(item.snippet.description),
			genre: "Date: "+item.snippet.publishedAt.substr(0,10),
		});
		  //items[item.id.videoId].date = item.snippet.publishedAt;
        break;

      case 'youtube#channel':
        page.appendItem(PREFIX + ":channel:" + item.id.channelId, 'directory', {
          title: item.snippet.title,
          icon: makeImageSet(item.snippet.thumbnails, channelImageSetSizes),
        });
        break;

      default:
        print("Unknown id.kind in result: " + item.id.kind);
        print(JSON.stringify(item, null, 4));
        return;
      }
      break;

    case 'youtube#subscription':
      var item = result.items[i];

      switch(item.snippet.resourceId.kind) {
      case 'youtube#channel':
        var ch = page.appendItem(PREFIX + ":channel:" + item.snippet.resourceId.channelId, 'video', {
        title: item.snippet.title,
        icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails),
		description: trimlf(item.snippet.description),
      });

		  var aux = {
			id: item.id,
			item: ch,
		  };

		  aux.unsubscribe = aux.item.addOptAction('Unsubscribe from ' + item.snippet.title, function() {
			api.subscriptions(this.id, 'del', function(ok) {
			  if(ok) {
				aux.item.destroyOption(this.unsubscribe);
				popup.notify('You are now unsubscribed from this channel', 5);
			  } else {
				popup.notify('Request for channel unsubscription failed!', 5);
			  }
			}.bind(this));
		  }.bind(aux), 'cancel');

        break;
      default:
        print("Unknown resource.kind in result: " + item.snippet.resourceId.kind);
        print(JSON.stringify(item, null, 4));
        return;
      }

      break;

    case 'youtube#videoCategory':
      URI = PREFIX + ":category:" + item.id;
      page.appendItem(URI, 'directory', {
        title: item.snippet.title
      });
      break;

    case 'youtube#playlist':
      page.appendItem(PREFIX + ":playlist:" + item.id + ":" + item.snippet.channelId, 'playlist', {
        title: item.snippet.title,
		icon: item.snippet.thumbnails.medium.url,
      });
      break;

    case 'youtube#channel':
      page.appendItem(PREFIX + ":channel:" + item.id, 'directory', {
        title: item.snippet.title,
        icon: makeImageSet(item.snippet.thumbnails, channelImageSetSizes),
      });
      break;

    default:
      print("Unknown kind in result: " + item.kind);
      print(JSON.stringify(item, null, 4));
      return;
    }
  }

  if(allvideos.length > 0) {

    // Add Like & Dislike buttons to all video items

    for(var i in allvideos) {
      var vid = allvideos[i];
      var item = items[vid];

      var aux = {
        vid: vid,
        item: item,
      };

      aux.like = item.addOptAction('Like', function() {
        api.rate(this.vid, 'like', function(ok) {
          if(ok) {
            item.destroyOption(this.like);
            item.destroyOption(this.dislike);
          } else {
            popup.notify('Request to like video failed', 5);
          }
        }.bind(this));
      }.bind(aux), 'thumb_up');

      aux.dislike = item.addOptAction('Dislike', function() {
        api.rate(this.vid, 'dislike', function(ok) {
          if(ok) {
            item.destroyOption(this.like);
            item.destroyOption(this.dislike);
          } else {
            popup.notify('Request to dislike video failed', 5);
          }
        }.bind(this));
      }.bind(aux), 'thumb_down');

      if(playlists.length)
          item.addOptURL('Add to Playlist',
							PREFIX + ':playlistadd:'+vid+':', 'add');
    }

    require('./api').call('videos', {
      id: allvideos.join(),
      part: 'snippet,contentDetails,statistics'
    }, null, function(result) {

      for(var i = 0; i < result.items.length; i++) {
        var item = result.items[i];
        var itemid = item.id;
        var metadata = items[itemid].root.metadata;

        metadata.duration     = parseISO8601Duration(item.contentDetails.duration);
        metadata.description  = trimlf(item.snippet.description);
        metadata.viewCount    = parseInt(item.statistics.viewCount);
        metadata.likeCount    = parseInt(item.statistics.likeCount);
        metadata.dislikeCount = parseInt(item.statistics.dislikeCount);
		likes = item.statistics.likeCount;
		views = item.statistics.viewCount;
		metadata.rating = parseInt(((likes)/(parseInt(likes)+parseInt(metadata.dislikeCount)))*100);

		if(likes>5000 && likes<1000000) likes=parseInt(likes*10/1000)/10+"k";
		else if(likes>1000000) likes=parseInt(likes*10/1000000)/10+"m";
		if(views>5000 && views<1000000) views=parseInt(views*10/1000)/10+"k";
		else if(views>1000000) views=parseInt(views*10/1000000)/10+"m";
		metadata.genre		  = "Date: "+item.snippet.publishedAt.substr(0,10)+"\r\nViews: "+views+"\r\nLikes: "+likes;

        if(item.snippet.channelId)
	    {
          items[itemid].addOptURL('Visit the Channel',
                                  PREFIX + ":channel:" + item.snippet.channelId,
                                 'tv');

		  var aux = {
			ch: item.snippet.channelId,
			item: items[itemid],
			title: item.snippet.channelTitle
		  };

		  aux.subscribe = aux.item.addOptAction('Subscribe to ' + item.snippet.channelTitle, function() {
			api.subscriptions(this.ch, 'add', function(ok) {
			  if(ok) {
				aux.item.destroyOption(this.subscribe);
				popup.notify('You are now subscribed to ' + this.title, 5);
			  } else {
				popup.notify('Request for channel subscription failed!', 5);
			  }
			}.bind(this));
		  }.bind(aux), 'favorite');

		}
      }
    });
  }
}


exports.browse = function(endpoint, page, query) {

  page.loading = true;
  page.type = 'directory';

  if(!query.part)
    query.part = 'snippet';

  query.maxResults = 30;

  function loader() {

    require('./api').call(endpoint, query, page, function(result) {
      if(result.pageInfo && result.pageInfo.totalResults === 0) {
        showNoContent(page);
        return;
      }
      populatePageFromResults(page, result);
      query.pageToken = result.nextPageToken;
      page.haveMore(!!query.pageToken);
    });
  }

  loader();
  page.asyncPaginator = loader;
}

exports.browse2 = function(endpoint, page, query) {

	page.loading = false;
	page.type = 'directory';
	query.part = 'snippet';
	query.order = 'relevance';
	query.maxResults = 15;

	var items = {};
	var allvideos = [];

	var result = require('./api').call2(endpoint, query);

		if(result && result.pageInfo && result.pageInfo.totalResults === 0) {
			showNoContent(page);
			return;
		}

		for(var j = 0; j < result.items.length; j++) {

			var item = result.items[j];

			if(item.kind === 'youtube#subscription')
			{
				var item = result.items[j];

				if(item.snippet.resourceId.kind === 'youtube#channel') 
				{
					query.order = 'date';
					query.part = 'snippet';
					query.maxResults = 5;
					query.channelId = item.snippet.resourceId.channelId;

					var result2 = require('./api').call2('search', query);

						if(result2 && result2.pageInfo && result2.pageInfo.totalResults)
						{
							  for(var i = 0; i < result2.items.length; i++) {

								var item = result2.items[i];

								switch(item.kind) {
								case 'youtube#searchResult':

								  switch(item.id.kind) {
								  case 'youtube#playlist':
									items[item.id.videoId] = page.appendItem(PREFIX + ":playlist:" + item.id.playlistId + ":", 'playlist', {
									  title: item.snippet.title,
									  icon: 'imageset:' + JSON.stringify(item.snippet.thumbnails),
									});
									items[item.id.videoId].date=item.snippet.publishedAt;

									break;

								  case 'youtube#video':
									items[item.id.videoId] = page.appendItem(PREFIX + ":video:" + item.id.videoId, 'video', {
										title: item.snippet.title,
										icon: 'http://i.ytimg.com/vi/'+item.id.videoId+'/mqdefault.jpg', //makeImageSet(item.snippet.thumbnails, videoImageSetSizes),
										description: trimlf(item.snippet.description),
										tagline: "Added: "+item.snippet.publishedAt.substr(0,10),
									});
									items[item.id.videoId].date=item.snippet.publishedAt;

									if(item.snippet.channelId)
										items[item.id.videoId].addOptURL('Visit the Channel [' + item.snippet.channelTitle + ']',
											  PREFIX + ":channel:" + item.snippet.channelId,
											 'tv');

									break;

								  default:
									  break;

								  }
								  break;

								default:
								  break;
								}
							  }
						}
				}

				var items2=page.getItems();
				var il=items2.length;

				if(il>1)
				{
					for (var k=0; k<il-1; k++)
					{
						for (var l=0; l<(il-k-1); l++)
						{
							if(items2[l].date<items2[l+1].date)
							{
								items2[l+1].moveBefore(items2[l]);
								items2=page.getItems();
							}
						}
					}
				}
			}
		}


/*
	  if(allvideos.length > 0) {

		result = require('./api').call2('videos', {
		  id: allvideos.join(),
		  part: 'snippet,contentDetails,statistics'
		});

		  for(var i = 0; i < result.items.length; i++) {
			var item = result.items[i];
			var itemid = item.id;
			var metadata = items[itemid].root.metadata;

			metadata.duration     = parseISO8601Duration(item.contentDetails.duration);
			metadata.description  = trimlf(item.snippet.description);
			metadata.viewCount    = parseInt(item.statistics.viewCount);
			metadata.likeCount    = parseInt(item.statistics.likeCount);
			metadata.dislikeCount = parseInt(item.statistics.dislikeCount);
			likes = item.statistics.likeCount;
			views = item.statistics.viewCount;
			metadata.rating = parseInt(((likes)/(parseInt(likes)+parseInt(metadata.dislikeCount)))*100);

			if(likes>5000 && likes<1000000) likes=parseInt(likes*10/1000)/10+"k";
			else if(likes>1000000) likes=parseInt(likes*10/1000000)/10+"m";
			if(views>5000 && views<1000000) views=parseInt(views*10/1000)/10+"k";
			else if(views>1000000) views=parseInt(views*10/1000000)/10+"m";
			metadata.genre		  = "Date: "+item.snippet.publishedAt.substr(0,10)+"\r\nViews: "+views+"\r\nLikes: "+likes;

			if(item.snippet.channelId)
			{
			  items[itemid].addOptURL('Visit the Channel',
									  PREFIX + ":channel:" + item.snippet.channelId,
									 'tv');
			}
		  }
	  }*/
}

function showNoContent(page) {
  page.flush();
  page.type = 'directory';
  page.appendPassiveItem('file', '', {
    title: 'No content'
  });
}


exports.search = function(page, query) {
  query.regionCode = REGION;

  page.loading = true;
  page.type = 'directory';

  if(!query.part)
    query.part = 'snippet';

  query.maxResults = 30;

  function loader() {
    require('./api').call('search', query, page, function(result) {

      if(result.pageInfo && result.pageInfo.totalResults === 0) {
        showNoContent(page);
        return;
      }
      populatePageFromResults(page, result);
      query.pageToken = result.nextPageToken;
      page.haveMore(!!query.pageToken);
    });
  }


  function reload() {
    delete query.pageToken;
    page.flush();
    loader();
  }

  page.options.createMultiOpt('order', 'Order by', [
    ['relevance',  'Relevance'],
    ['date',       'Date', true],
    ['title',      'Title'],
    ['rating',     'Rating'],
    ['videoCount', 'Videos'],
    ['viewCount',  'View Count']], function(order) {
      query.order = order;
      if(page.asyncPaginator) {
        reload();
      }
    }, true);

  page.options.createMultiOpt('duration', 'Durations', [
    ['any',     'Any', true],
    ['short',  '<4 min'],
    ['medium',  '4-20 min'],
    ['long',    '>20 min']], function(duration) {
      query.videoDuration = duration;
      if(duration != 'any') 
        query.type = 'video'
      if(page.asyncPaginator) {
        reload();
      }
    }, true);

  loader();
  page.asyncPaginator = loader;
}

