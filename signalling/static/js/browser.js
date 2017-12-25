(function () {
  'use strict';

  // 1. check websocket
  // 2. check video
  // 3. start local stream
  // 4. start socket
  // 5. create peer connections

  // check websocket support
  if (!window.WebSocket) {
    alert('WebSocket is not supported');
    return;
  }

  var joinRoom = false;
  var username;
  var wrap = $('#wrap');
  var listOfUsers = $('ul.users-list');
  var modal = $('#nameModal');
  var localVideo = $('#local-video');
  var localStream;
  var cc_list = {};
  window.cc_list = cc_list;
  var socket;
  var servers = null;

  var config = {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302'],
        username: '',
        credential: '',
      },
    ],
  };

  var constraints = {
    optional: [
      {
        googIPv6: true,
      },
    ],
  };

  modal.modal('show').on('hide.bs.modal', function () {
    return joinRoom;
  });

  $('#nameModal form').on('submit', function (e) {
    e.preventDefault();
    username = $('#username')
      .val()
      .trim();
    var err = $('.modal .err');
    err.hide(0);
    if (!username) {
      err.slideDown();
    } else {
      joinRoom = true;
      modal.modal('hide');
      wrap.addClass('active');
      listOfUsers.append('<li>' + username + '</li>');
      checkEnumerateDevices();
    }
  });

  $('#chat-wrap form').on('submit', function (e) {
    e.preventDefault();
    var messageField = $(this).find('input[name=message]');
    var messageText = messageField.val().trim();
    if (messageText)
      socket.send(
        JSON.stringify({
          type: 'chat',
          data: { text: messageText, name: '' },
          to: '',
        })
      );
    messageField.val('').focus();
  });

  function checkEnumerateDevices() {
    navigator.mediaDevices
      .enumerateDevices()
      .then(function (deviceInfos) {
        var hasVideo = false;
        for (var i = 0; i !== deviceInfos.length; ++i) {
          var deviceInfo = deviceInfos[i];
          if (deviceInfo.kind === 'videoinput') {
            hasVideo = true;
            localVideo.addClass('active');
            break;
          }
        }

        console.log('Check video - ', hasVideo);
        startStream(true, hasVideo);
      })
      .catch(function (error) {
        alert('navigator.getUserMedia error');
        console.log('navigator.getUserMedia error: ', error);
      });
  }

  // open local stream
  function startStream(hasAudio, hasVideo) {
    console.log('Requesting local stream');
    navigator.mediaDevices
      .getUserMedia({
        audio: hasAudio,
        video: hasVideo,
      })
      .then(gotStream)
      .catch(function (e) {
        alert('getUserMedia() error: ' + e.name);
      });
  }

  function gotStream(stream) {
    console.log('Received local stream (startStream)');
    localVideo[0].srcObject = stream;
    localStream = stream;
    startSocket();
  }

  function startSocket() {
    socket = new WebSocket(
      'wss://' + document.location.host + '/ws?name=' + username
    );

    socket.onopen = function () {
      console.log('WebSocket сonnection established');
    };

    socket.onclose = function (event) {
      if (event.wasClean) {
        console.log('The connection is closed cleanly');
      } else {
        console.log('Connection failure');
      }

      console.log('Code: ' + event.code + ', reason: ' + event.reason);
    };

    socket.onerror = function (error) {
      console.log('Error', error);
    };

    socket.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      var type = msg.type;
      if (type == 'room') {
        compareRoom(msg.data);
      } else if (type == 'offer') {
        createSlavePeer(cc_list[msg.from], msg.data, msg.from);
      } else if (type == 'answer') {
        setRemoteDesc(cc_list[msg.from].master, msg.data);
      } else if (type == 'ice') {
        if (msg.ice_type == 'master') {
          console.log('adding ice for slave', msg.from, cc_list[msg.from]);
          addIce(cc_list[msg.from].slave, msg.data);
        } else {
          console.log('adding ice for master', msg.from, cc_list[msg.from]);
          addIce(cc_list[msg.from].master, msg.data);
        }
      } else if (type == 'chat') {
        printChatMessage(msg.data.name, msg.data.text);
      } else {
        throw new Error('Unknown type');
      }
    };
  }

  function printChatMessage(sender, text) {
    var chatMessages = $('#chat-wrap .chat-messages');
    if (
      chatMessages.scrollTop() + chatMessages.outerHeight() >=
      chatMessages.prop('scrollHeight')
    ) {
      chatMessages.append('<p><b>' + sender + '</b>' + text + '</p>');
      chatMessages.scrollTop(chatMessages.prop('scrollHeight'));
    } else {
      chatMessages.append('<p><b>' + sender + '</b>' + text + '</p>');
    }
  }

  function compareRoom(lst) {
    console.log('compare room', lst);
    for (var key in cc_list) {
      if (!(key in lst)) {
        console.log('REMOVE ' + key);
        delete cc_list[key];
        var video = $('#' + key);
        if (video.length) video.remove();
        listOfUsers.find('.' + key).remove();
      }
    }

    for (var item in lst) {
      if (!(item in cc_list)) {
        console.log('ADD ' + item);
        listOfUsers.append(
          '<li class="' + item + '">' + lst[item].name + '</li>'
        );
        cc_list[item] = {};
        createMasterPeer(cc_list[item], item);
      }
    }

    console.log('cc_list', cc_list);
  }

  function createMasterPeer(obj, key) {
    obj.master = new RTCPeerConnection(config, constraints);
    obj.master.onicecandidate = function (e) {
      if (e.candidate) {
        socket.send(
          JSON.stringify({
            type: 'ice',
            data: e.candidate,
            to: key,
            ice_type: 'master',
          })
        );
      }
    };

    localStream.getTracks().forEach(function (track) {
      obj.master.addTrack(track, localStream);
    });

    createOffer(obj.master, key);
  }

  function createSlavePeer(obj, desc, key) {
    console.log('createSlavePeer');
    obj.slave = new RTCPeerConnection(config, constraints);
    obj.slave.onicecandidate = function (e) {
      if (e.candidate) {
        socket.send(
          JSON.stringify({
            type: 'ice',
            data: e.candidate,
            to: key,
            ice_type: 'slave',
          })
        );
      }
    };

    obj.slave.ontrack = function (e) {

      var remoteVideo = $('#' + key);

      if (!remoteVideo.length) {
        remoteVideo = $('#video-wrap').append(
          '<video id="' + key + '" autoplay></video>'
        );
      }

      if (remoteVideo[0].srcObject !== e.streams[0]) {
        remoteVideo[0].srcObject = e.streams[0];
      }

    };

    createAnswer(obj.slave, desc, key);
  }

  function createOffer(c, key) {
    console.log('createOffer');
    c.createOffer({
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1,
      })
      .then(function (desc) {
        console.log('desc offer created');
        c.setLocalDescription(desc).then(function () {
          console.log('setLocalDescription complete');
          socket.send(JSON.stringify({ type: 'offer', data: desc, to: key }));
          console.log('offer sent');
        }, onSetSessionDescriptionError);
      }, onCreateSessionDescriptionError);
  }

  function createAnswer(c, desc, key) {
    c.setRemoteDescription(desc).then(function () {
      console.log('setRemoteDescription complete');
    }, onSetSessionDescriptionError);

    console.log('createAnswer');

    c.createAnswer().then(function (desc) {
      console.log('desc answer created');
      c.setLocalDescription(desc).then(function () {
        console.log('setLocalDescription complete');
        socket.send(JSON.stringify({ type: 'answer', data: desc, to: key }));
        console.log('answer sent');
      }, onSetSessionDescriptionError);
    }, onCreateSessionDescriptionError);
  }

  function setRemoteDesc(c, desc) {
    c.setRemoteDescription(desc).then(function () {
      console.log('setRemoteDescription complete');
    }, onSetSessionDescriptionError);
  }

  function addIce(c, data) {
    c.addIceCandidate(data).then(
      function () {
        console.log('ICE candidate added');
      },

      function (err) {
        console.log('ICE candidate NOT ADDED!!!');
      }
    );
  }

  function onCreateSessionDescriptionError(error) {
    console.log('Failed to create session description: ' + error.toString());
  }

  function onSetSessionDescriptionError(error) {
    console.log('Failed to set session description: ' + error.toString());
  }
})();
