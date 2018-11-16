/*
  Movian Youtube Plugin
  (c) 2016 Andreas Smas All rights reserved
 */

/*

 This plugin is split into multiple files and the intention is to keep the
 main youtube.js file small for faster loading on slower devices

 It's comprised of the following files

   youtube.js - This file

   api.js -  Youtube/Google API helper and authentication
   browse.js - Handle browse and search of endpoints

*/

var modsearch = Duktape.modSearch;
Duktape.modSearch = function(a, b, c, d) {
  switch(a) {
   case 'html-entities':
   case 'path':
   case 'sax':
    return modsearch('./support/' + a, b, c, d);
  default:
    return modsearch(a,b,c,d);
  }
}

var REGION = 'us';
var PREFIX = "youtube";
var UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:15.0) Gecko/20100101 Firefox/15.0.1'
var page = require('showtime/page');
var io = require('native/io'); // XXX: Bad to require('native/')
var prop = require('showtime/prop');
var popup = require('showtime/popup');
var http = require('showtime/http');

io.httpInspectorCreate('https://www.youtube.com/.*', function(ctrl) {
  ctrl.setHeader('User-Agent', UA);
  return 0;
});



/*
 * Get ISO 3166-1 Alpha 2 region code.
 * Movian stores this in the global property tree.
 */
prop.subscribeValue(prop.global.location.cc, function(value) {
  if(typeof value === 'string') {
    REGION = value;
    console.log("Region set to " + value);
  }
});




/**
 * Small helper to decorate the page metadata with info from the given
 * endpoint+query
 */
var channels = require('showtime/store').create('channels');
var playlists = [];
var mychannelPos = 0;
var mychannelTitle = "My Channel";
var mychannelIcon = null;

function pagemeta(page, endpoint, query, block) {
  query.part = 'snippet';
  if(endpoint === 'channels') query.part += ",brandingSettings";

  if(channels[query.id])
	{
		page.metadata.title = channels[query.id].title;
		page.metadata.icon = channels[query.id].icon;
		page.metadata.logo = channels[query.id].icon;
		if(channels[query.id].background)
		{
			page.metadata.background = channels[query.id].background;
			page.metadata.backgroundAlpha = 0.25;
			page.metadata.backgroundAvailable = true;
		}
		return;
	}

function populate(info)
{
    var item = info.items[0];
    page.metadata.title = item.snippet.title;
    if(item.snippet.thumbnails)
	{
      page.metadata.icon = item.snippet.thumbnails.medium.url;
	  page.metadata.logo = item.snippet.thumbnails.medium.url;
	}
	if(endpoint === 'channels' && item.brandingSettings && item.brandingSettings.image.bannerTvLowImageUrl)
    {
		page.metadata.background = item.brandingSettings.image.bannerTvLowImageUrl;
		page.metadata.backgroundAlpha = 0.25;
		page.metadata.backgroundAvailable = true;

		channels[query.id] = {
			title: item.snippet.title,
			icon: item.snippet.thumbnails.medium.url,
			background: item.brandingSettings.image.bannerTvLowImageUrl,
			featuredUrls: item.brandingSettings.channel.featuredChannelsUrls,
			featuredTitle: item.brandingSettings.channel.featuredChannelsTitle,
			description: item.snippet.description.replace(/(\r\n|\n|\r)/gm," ")
		};
    }
	else
	  {
		channels[query.id] = {
			title: item.snippet.title,
			icon: (item.snippet.thumbnails?item.snippet.thumbnails.default.url:null),
			background: null,
			description: (item.snippet.description?item.snippet.description.replace(/(\r\n|\n|\r)/gm," "):"")
		};
	  }
  }

	if(block)
	{
		info = require('./api').call2(endpoint, query);
		populate(info);
	}
	else
		require('./api').call(endpoint, query, null, function(info){populate(info)});
}


// Create the service (ie, icon on home screen)
require('showtime/service').create("Youtube", PREFIX + ":start", "video", true,
                                   Plugin.path + 'youtube.svg');



new page.Route(PREFIX + ":channelpl:(.*)", function(page, channelid) {
  pagemeta(page, 'channels', {id: channelid});

  require('./browse').browse('playlists', page, {
    channelId: channelid,
    part: 'snippet,contentDetails',
  });

});

new page.Route(PREFIX + ":channelft:(.*)", function(page, channelid) {

	pagemeta(page, 'channels', {id: channelid}, true);
	page.type = 'directory';
	page.model.contents = 'grid';

	var featured = channels[channelid].featuredUrls;
	if(!featured) 
	{
		 page.appendPassiveItem('file', '', {
			title: 'No content'
		  });
		return;
	}

    page.metadata.showTitleAndIcon = true;
    page.metadata.title = channels[channelid].featuredTitle;

    var items = {};
	var featured2 = [];
	for(var i = 0; i < featured.length; i++)
	{
      items[featured[i]] = page.appendItem(PREFIX + ":channel:" + featured[i], 'video', {});
	  if(channels[featured[i]])
		{
		  items[featured[i]].root.metadata.title = channels[featured[i]].title;
		  items[featured[i]].root.metadata.icon = channels[featured[i]].icon;
		  items[featured[i]].root.metadata.description = channels[featured[i]].description;
		}
		else
			featured2.push(featured[i]);
	}

    // Do one extra call to figure out the name for the channels we
    // extracted above
	if(featured2.length)
	{
		result = require('./api').call2('channels', {
		  id: featured2,
		  part: 'snippet,brandingSettings'
		});

      for(var i = 0; i < result.items.length; i++) {
        var item = result.items[i];
        var itemid = item.id;
        var metadata = items[itemid].root.metadata;
        metadata.title = item.snippet.title;
        metadata.icon = item.snippet.thumbnails.default.url;
		metadata.description = item.snippet.description.replace(/(\r\n|\n|\r)/gm," ");

		channels[itemid] = {
			title: item.snippet.title,
			icon: item.snippet.thumbnails.default.url,
			background: item.brandingSettings.image.bannerTvLowImageUrl,
			featuredUrls: item.brandingSettings.channel.featuredChannelsUrls,
			featuredTitle: item.brandingSettings.channel.featuredChannelsTitle,
			description: item.snippet.description.replace(/(\r\n|\n|\r)/gm," ")
		};
	  }
	}

	for(var i = 0; i < featured.length; i++)
	{
		  var aux = {
			ch: featured[i],
			item: items[featured[i]],
			title: channels[featured[i]].title
		  };

		  aux.subscribe = aux.item.addOptAction('Subscribe to ' + channels[featured[i]].title, function() {
			require('./api').subscriptions(this.ch, 'add', function(ok) {
			  if(ok) {
				aux.item.destroyOption(this.subscribe);
				popup.notify('You are now subscribed to ' + this.title, 5);
			  } else {
				popup.notify('Request for channel subscription failed!', 5);
			  }
			}.bind(this));
		  }.bind(aux), 'favorite');
      }
});


// Setup all the routes we need
// Most of these just maps this to a browse query
new page.Route(PREFIX + ":channel:(.*)", function(page, channelid) {
  pagemeta(page, 'channels', {id: channelid}, true);

  page.appendItem(PREFIX + ":channelpl:"+channelid, 'directory', {
    title: 'Playlists'
  });


  page.appendItem(PREFIX + ":channelft:"+channelid, 'directory', {
    title: (channels[channelid] && channels[channelid].featuredTitle)?channels[channelid].featuredTitle:'Featured'
  });


  require('./browse').search(page, {
    channelId: channelid
  });
});


new page.Route(PREFIX + ":category:(.*)", function(page, category) {
  page.metadata.icon = Plugin.path + 'youtube.svg';
  pagemeta(page, 'videoCategories', {id: category});
  require('./browse').search(page, {
    videoCategoryId: category,
    type: 'video',
  });
});

new page.Route(PREFIX + ":search:(.*)", function(page, query) {
  page.metadata.icon = Plugin.path + 'youtube.svg';
  page.metadata.title = 'Search results for: ' + query;
  require('./browse').search(page, {
    q: query
  });
});

new page.Route(PREFIX + ":categories", function(page) {
  page.metadata.title = 'Categories';
  page.metadata.icon = Plugin.path + 'youtube.svg';
  require('./browse').browse('videoCategories', page, {
    regionCode: REGION
  });
});

new page.Route(PREFIX + ":my:subscriptions", function(page) {
  page.metadata.title = "Subscriptions";
  page.model.contents = 'grid';

  require('./browse').browse('subscriptions', page, {
    mine: true,
    part: 'snippet,contentDetails',
  });
});

new page.Route(PREFIX + ":my:subscriptionsfeed", function(page) {
  page.metadata.title = "Latest in My Subscriptions";
  page.model.contents = 'grid';
  require('./browse').browse2('subscriptions', page, {
    mine: true,
  });


});

new page.Route(PREFIX + ":my:playlists", function(page) {

	page.type = 'directory';
	page.model.contents = 'grid';

	if(!playlists.length) myplaylists(page);

	page.metadata.title = mychannelTitle;
	page.metadata.icon = mychannelIcon;
	page.metadata.logo = mychannelIcon;

	if(!playlists.length)
	{
		page.appendPassiveItem('file', '', {title: 'No content'});
		return;
	}

	for(var i=0; i<playlists.length; i++)
	{
		if(i===mychannelPos)
			page.appendItem(null, 'separator', {});

		page.appendItem(PREFIX + ":playlist:" + playlists[i].id, 'playlist', {
			title: playlists[i].title,
			icon: playlists[i].thumb,
		});
	}
});

new page.Route(PREFIX + ":playlistadd:(.*):(.*)", function(page, vid, pl) {
	page.metadata.title = "Select Playlist";
	page.type = 'directory';

	if(!playlists.length)
	{
		page.appendPassiveItem('file', '', {title: 'No content'});
		return;
	}

	if(vid && pl)
	{
		page.loading = true;
		require('./api').addplayitem(vid, playlists[pl].id);
		page.loading = false;

		page.redirect(PREFIX + ':playlist:' + playlists[pl].id);
		return;
	}

	for(var i=0; i<mychannelPos; i++)
	{
		page.appendItem(PREFIX + ":playlistadd:" + vid + ":" + i, 'playlist', {
			title: playlists[i].title,
			icon: playlists[i].thumb,
		});
	}
});

function playlistPage(page, playlistid) {
  pagemeta(page, 'playlists', {id: playlistid});
  require('./browse').browse('playlistItems', page, {
    playlistId: playlistid,
  });
}

function myplaylists(page)
{
	if(playlists.length) return;

	query = {
		part: 'snippet',
		mine: true,
		maxResults: 30
	};

	require('./api').call('playlists', query, page, function(result) {
		if(result.pageInfo && result.pageInfo.totalResults === 0) {
			return;
		}

		for(var i = 0; i < result.items.length; i++) {

			var item = result.items[i];

			if(item.kind === 'youtube#playlist')
			{
				playlists.push({
					id: item.id,
					title: item.snippet.title,
					thumb: item.snippet.thumbnails.medium.url
				});
			}
		}

		var info = require('./api').call2('channels', {
			part: 'snippet,contentDetails',
			mine: true
		});
		
		if(!info || !info.items) return;
		
		mychannelTitle = info.items[0].snippet.title;
		if(info.items[0].snippet.thumbnails)
			mychannelIcon = info.items[0].snippet.thumbnails.medium.url;

		mychannelPos = playlists.length;

		var result = require('./api').call2('playlists', {
			id: info.items[0].contentDetails.relatedPlaylists['likes']+','+
				info.items[0].contentDetails.relatedPlaylists['uploads'],
			part: 'snippet'
		});

		for(var i = 0; i < result.items.length; i++) {
			var item = result.items[i];
			if(item.kind === 'youtube#playlist')
			{
				playlists.push({
					id: item.id,
					title: item.snippet.title,
					thumb: item.snippet.thumbnails.medium.url
				});
			}
		}

  });
}

new page.Route(PREFIX + ":playlist:(.*)", playlistPage);
new page.Route("https://www.youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 
new page.Route("https://youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 
new page.Route("http://www.youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 
new page.Route("http://youtube.com/playlist\\?list=([A-Za-z0-9_\\-]*)", playlistPage); 

new page.Route(PREFIX + ":guidecategory:(.*)", function(page, catid) {
  pagemeta(page, 'guideCategories', {id: catid});
  page.model.contents = 'grid';
  require('./browse').browse('channels', page, {
    categoryId: catid
  });
});


// Landing page
new page.Route(PREFIX + ":start", function(page) {

  page.type = 'directory';

  page.metadata.title = "Youtube";
  page.metadata.icon = Plugin.path + 'youtube.svg';

  page.appendItem(PREFIX + ":search:", 'search', {});

  page.appendItem(null, 'separator', {});

  page.appendItem(PREFIX + ":my:subscriptions", 'directory', {
    title: "My Subscriptions",
  }).root.subtype = 'subscriptions';

  page.appendItem(PREFIX + ":my:playlists", 'playlist', {
    title: "My Playlists",
  });

  page.appendItem(PREFIX + ":my:subscriptionsfeed", 'directory', {
    title: "Subscriptions Feed",
  }).root.subtype = 'apps';

  page.appendItem(null, 'separator', {});

  page.appendItem(PREFIX + ":channelguide", 'playlist', {
    title: 'Channel Guide'
  }).root.subtype = 'description';

  page.appendItem(PREFIX + ":categories", 'directory', {
    title: 'Video Categories'
  }).root.subtype = 'local_movies';

  myplaylists(page);

});

new page.Route(PREFIX + ":channelguide", function(page) {
  page.metadata.title = "Categories";
  page.metadata.icon = Plugin.path + 'youtube.svg';
  page.type = 'directory';

  require('./api').call('guideCategories', {
    part: 'snippet',
    regionCode: REGION
  }, null, function(result) {

    for(var x in result.items) {
      var item = result.items[x];
      page.appendItem(PREFIX + ":guidecategory:" + item.id, 'directory', {
        title: item.snippet.title
      });
    }
  });

});

// Page for video playback
function videoPage(page, id) {
  var ytdl = require('./ytdl-core/lib/info');
  page.loading = true;
  page.type = 'video';

  ytdl('https://www.youtube.com/watch?v=' + id, function(err, info) {
    if(err) {
      page.loading = false;
      page.error(err);
      return;
    }

	var subs = null;
	try 
	{
		subs = JSON.parse(http.request("http://deanbg.com/sub/yt/?video="+id));
	}	catch(err){;}

    var url = info.formats[0].url;
    var mimetype = (info.formats[0].type ? info.formats[0].type.split(';')[0] : '');  
    if (!mimetype)
        url = 'hls:' + url;
    
    var videoParams = {
      title: unescape(info.title),
	  icon: 'http://i.ytimg.com/vi/'+id+'/mqdefault.jpg',
      canonicalUrl: PREFIX + ':video:' + info.video_id,
      sources: [{
        url: url,
        mimetype: mimetype,
      }],
      no_subtitle_scan: true,
      subtitles: subs
    }

    page.source = 'videoparams:' + JSON.stringify(videoParams);
  });
}

// Routes for video playback
new page.Route(PREFIX + ":video:(.*)", videoPage);

// These allows us to play standard youtube links
new page.Route("http://www.youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("https://www.youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("http://youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("https://youtube.com/watch\\?v=([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("http://youtu.be/([A-Za-z0-9_\\-]*)", videoPage);
new page.Route("https://youtu.be/([A-Za-z0-9_\\-]*)", videoPage);
