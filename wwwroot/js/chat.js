const { createApp } = Vue;

var wsconn = new signalR.HubConnectionBuilder().withAutomaticReconnect().withUrl("/chatHub").build();
wsconn.on("ReceiveMessage", function (user, message) {
    var msg = JSON.parse(message);//{Id: 7, FromUser: 2, ToUser: 1, Message: 'Hello Vue! c', Time: '2022-05-13T12:02:18.0842484+06:00'}
    var u = sessionStorage.getItem('id');
    window.app.addChat(msg.Id, msg.FromUser, msg.ToUser, msg.Message, msg.Time, msg.ToUser == u, msg.FileName);
    window.app.chatScrollToBottom(0);
});
wsconn.on("UserUpdated", function (user, message) {
    window.app.GetUsers();
});

var peerConnectionConfig = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };
//    "iceServers": [
//        { "urls": "stun:stun.l.google.com:19302?transport=udp" },
//        { "urls": "stun:numb.viagenie.ca:3478?transport=udp" },
//        { "urls": "turn:numb.viagenie.ca:3478?transport=udp", "username": "shahzad@fms-tech.com", "credential": "P@ssw0rdfms" },
//        { "urls": "turn:turn-testdrive.cloudapp.net:3478?transport=udp", "username": "redmond", "credential": "redmond123" }
//    ]
//};


var webrtcConstraints = { audio: true, video: false };
var streamInfo = { applicationName: WOWZA_APPLICATION_NAME, streamName: WOWZA_STREAM_NAME, sessionId: WOWZA_SESSION_ID_EMPTY };

var WOWZA_STREAM_NAME = null, connections = {}, localStream = null;

const attachMediaStream = (e) => {
    //console.log(e);
    console.log("OnPage: called attachMediaStream");
    var partnerAudio = document.querySelector('.audio.partner');
    if (partnerAudio.srcObject !== e.stream) {
        partnerAudio.srcObject = e.stream;
        console.log("OnPage: Attached remote stream");
    }
};

const receivedCandidateSignal = (connection, partnerClientId, candidate) => {
    //console.log('candidate', candidate);
    //if (candidate) {
    console.log('WebRTC: adding full candidate');
    connection.addIceCandidate(new RTCIceCandidate(candidate), () => console.log("WebRTC: added candidate successfully"), () => console.log("WebRTC: cannot add candidate"));
    //} else {
    //    console.log('WebRTC: adding null candidate');
    //   connection.addIceCandidate(null, () => console.log("WebRTC: added null candidate successfully"), () => console.log("WebRTC: cannot add null candidate"));
    //}
}

// Process a newly received SDP signal
const receivedSdpSignal = (connection, partnerClientId, sdp) => {
    console.log('connection: ', connection);
    console.log('sdp', sdp);
    console.log('WebRTC: called receivedSdpSignal');
    console.log('WebRTC: processing sdp signal');
    connection.setRemoteDescription(new RTCSessionDescription(sdp), () => {
        console.log('WebRTC: set Remote Description');
        if (connection.remoteDescription.type == "offer") {
            console.log('WebRTC: remote Description type offer');
            connection.addStream(localStream);
            console.log('WebRTC: added stream');
            connection.createAnswer().then((desc) => {
                console.log('WebRTC: create Answer...');
                connection.setLocalDescription(desc, () => {
                    console.log('WebRTC: set Local Description...');
                    console.log('connection.localDescription: ', connection.localDescription);
                    //setTimeout(() => {
                    sendHubSignal(JSON.stringify({ "sdp": connection.localDescription }), partnerClientId);
                    //}, 1000);
                }, errorHandler);
            }, errorHandler);
        } else if (connection.remoteDescription.type == "answer") {
            console.log('WebRTC: remote Description type answer');
        }
    }, errorHandler);
}

// Hand off a new signal from the signaler to the connection
const newSignal = (partnerClientId, data) => {
    console.log('WebRTC: called newSignal');
    //console.log('connections: ', connections);

    var signal = JSON.parse(data);
    var connection = getConnection(partnerClientId);
    //console.log("signal: ", signal);
    //console.log("signal: ", signal.sdp || signal.candidate);
    //console.log("partnerClientId: ", partnerClientId);
    console.log("connection: ", connection);

    // Route signal based on type
    if (signal.sdp) {
        console.log('WebRTC: sdp signal');
        receivedSdpSignal(connection, partnerClientId, signal.sdp);
    } else if (signal.candidate) {
        console.log('WebRTC: candidate signal');
        receivedCandidateSignal(connection, partnerClientId, signal.candidate);
    } else {
        console.log('WebRTC: adding null candidate');
        // connection.addIceCandidate(null, () => console.log("WebRTC: added null candidate successfully"), () => console.log("WebRTC: cannot add null candidate"));
    }
}

const onReadyForStream = (connection) => {
    console.log("WebRTC: called onReadyForStream");
    // The connection manager needs our stream
    //console.log("onReadyForStream connection: ", connection);
    connection.addStream(localStream);
    console.log("WebRTC: added stream");
}

const onStreamRemoved = (connection, streamId) => {
    console.log("WebRTC: onStreamRemoved -> Removing stream: ");
    //console.log("Stream: ", streamId);
    //console.log("connection: ", connection);
}
// Close the connection between myself and the given partner
const closeConnection = (partnerClientId) => {
    console.log("WebRTC: called closeConnection ");
    var connection = connections[partnerClientId];

    if (connection) {
        // Let the user know which streams are leaving
        // todo: foreach connection.remoteStreams -> onStreamRemoved(stream.id)
        onStreamRemoved(null, null);

        // Close the connection
        connection.close();
        delete connections[partnerClientId]; // Remove the property
    }
}
// Close all of our connections
const closeAllConnections = () => {
    console.log("WebRTC: call closeAllConnections ");
    for (var connectionId in connections) {
        closeConnection(connectionId);
    }
}

const getConnection = (partnerClientId) => {
    console.log("WebRTC: called getConnection");
    if (connections[partnerClientId]) {
        console.log("WebRTC: connections partner client exist");
        return connections[partnerClientId];
    }
    else {
        console.log("WebRTC: initialize new connection");
        return initializeConnection(partnerClientId)
    }
}

const initiateOffer = (partnerClientId, stream) => {
    console.log('WebRTC: called initiateoffer: ');
    var connection = getConnection(partnerClientId); // // get a connection for the given partner
    //console.log('initiate Offer stream: ', stream);
    //console.log("offer connection: ", connection);
    connection.addStream(stream);// add our audio/video stream
    console.log("WebRTC: Added local stream");

    connection.createOffer().then(offer => {
        console.log('WebRTC: created Offer: ');
        console.log('WebRTC: Description after offer: ', offer);
        connection.setLocalDescription(offer).then(() => {
            console.log('WebRTC: set Local Description: ');
            console.log('connection before sending offer ', connection);
            setTimeout(() => {
                sendHubSignal(JSON.stringify({ "sdp": connection.localDescription }), partnerClientId);
            }, 1000);
        }).catch(err => console.error('WebRTC: Error while setting local description', err));
    }).catch(err => console.error('WebRTC: Error while creating offer', err));

    //connection.createOffer((desc) => { // send an offer for a connection
    //    console.log('WebRTC: created Offer: ');
    //    console.log('WebRTC: Description after offer: ', JSON.stringify(desc));
    //    connection.setLocalDescription(desc, () => {
    //        console.log('WebRTC: Description after setting locally: ', JSON.stringify(desc));
    //        console.log('WebRTC: set Local Description: ');
    //        console.log('connection.localDescription: ', JSON.stringify(connection.localDescription));
    //        sendHubSignal(JSON.stringify({ "sdp": connection.localDescription }), partnerClientId);
    //    });
    //}, errorHandler);
}

const callbackUserMediaSuccess = (stream) => {
    console.log("WebRTC: got media stream");
    localStream = stream;

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        console.log(`Using Audio device: ${audioTracks[0].label}`);
    }
};

const initializeUserMedia = () => {
    console.log('WebRTC: InitializeUserMedia: ');
    navigator.mediaDevices.getUserMedia(webrtcConstraints).then(ms => {
        callbackUserMediaSuccess(ms);
    }, r => console.log(r));

    // navigator.mediaDevices.getUserMedia(webrtcConstraints, callbackUserMediaSuccess, errorHandler);
};
// stream removed
const callbackRemoveStream = (connection, evt) => {
    console.log('WebRTC: removing remote stream from partner window');
    // Clear out the partner window
    var otherAudio = document.querySelector('.audio.partner');
    otherAudio.src = '';
}

const callbackAddStream = (connection, evt) => {
    console.log('WebRTC: called callbackAddStream');

    // Bind the remote stream to the partner window
    //var otherVideo = document.querySelector('.video.partner');
    //attachMediaStream(otherVideo, evt.stream); // from adapter.js
    attachMediaStream(evt);
}

const callbackNegotiationNeeded = (connection, evt) => {
    console.log("WebRTC: Negotiation needed...");
    //console.log("Event: ", evt);
}

const callbackIceCandidate = (evt, connection, partnerClientId) => {
    console.log("WebRTC: Ice Candidate callback");
    //console.log("evt.candidate: ", evt.candidate);
    if (evt.candidate) {// Found a new candidate
        console.log('WebRTC: new ICE candidate');
        //console.log("evt.candidate: ", evt.candidate);
        sendHubSignal(JSON.stringify({ "candidate": evt.candidate }), partnerClientId);
    } else {
        // Null candidate means we are done collecting candidates.
        console.log('WebRTC: ICE candidate gathering complete');
        sendHubSignal(JSON.stringify({ "candidate": null }), partnerClientId);
    }
}

const initializeConnection = (partnerClientId) => {
    console.log('WebRTC: Initializing connection...');
    //console.log("Received Param for connection: ", partnerClientId);

    var connection = new RTCPeerConnection(peerConnectionConfig);

    //connection.iceConnectionState = evt => console.log("WebRTC: iceConnectionState", evt); //not triggering on edge
    //connection.iceGatheringState = evt => console.log("WebRTC: iceGatheringState", evt); //not triggering on edge
    //connection.ondatachannel = evt => console.log("WebRTC: ondatachannel", evt); //not triggering on edge
    //connection.oniceconnectionstatechange = evt => console.log("WebRTC: oniceconnectionstatechange", evt); //triggering on state change 
    //connection.onicegatheringstatechange = evt => console.log("WebRTC: onicegatheringstatechange", evt); //triggering on state change 
    //connection.onsignalingstatechange = evt => console.log("WebRTC: onsignalingstatechange", evt); //triggering on state change 
    //connection.ontrack = evt => console.log("WebRTC: ontrack", evt);
    connection.onicecandidate = evt => callbackIceCandidate(evt, connection, partnerClientId); // ICE Candidate Callback
    //connection.onnegotiationneeded = evt => callbackNegotiationNeeded(connection, evt); // Negotiation Needed Callback
    connection.onaddstream = evt => callbackAddStream(connection, evt); // Add stream handler callback
    connection.onremovestream = evt => callbackRemoveStream(connection, evt); // Remove stream handler callback

    connections[partnerClientId] = connection; // Store away the connection based on username
    //console.log(connection);
    return connection;
}

const sendHubSignal = (candidate, partnerClientId) => {
    console.log('candidate', candidate);
    console.log('SignalR: called sendhubsignal ');
    wsconn.invoke('SendSignal', candidate, partnerClientId).catch(errorHandler);
};
const errorHandler = (error) => {
    if (error.message)
        alertify.alert('<h4>Error Occurred</h4></br>Error Info: ' + JSON.stringify(error.message));
    else
        alertify.alert('<h4>Error Occurred</h4></br>Error Info: ' + JSON.stringify(error));

    consoleLogger(error);
};
wsconn.onclose(e => {
    if (e) {
        console.log("SignalR: closed with error.");
        console.log(e);
    }
    else {
        console.log("Disconnected");
    }
});


// Hub Callback: Call Accepted
wsconn.on('CallAccepted', (acceptingUser) => {
    console.log('SignalR: call accepted from: ' + JSON.stringify(acceptingUser) + '.  Initiating WebRTC call and offering my stream up...');

    // Callee accepted our call, let's send them an offer with our video stream
    initiateOffer(acceptingUser.connectinId, localStream); // Will use driver email in production
    // Set UI into call mode
});

// Hub Callback: Call Declined
wsconn.on('CallDeclined', (decliningUser, reason) => {
    console.log('SignalR: call declined from: ' + decliningUser.connectionId);

    // Let the user know that the callee declined to talk
    alertify.error(reason);

    // Back to an idle UI
    //$('body').attr('data-mode', 'idle');
});

// Hub Callback: Incoming Call
wsconn.on('IncomingCall', (callingUser) => {
    console.log('SignalR: incoming call from: ' + JSON.stringify(callingUser));

    // Ask if we want to talk
    alertify.confirm(callingUser.name + ' is calling.  Do you want to chat?', function (e) {
        if (e) {
            // I want to chat
            wsconn.invoke('AnswerCall', true, callingUser).catch(err => console.log(err));
        } else {
            // Go away, I don't want to chat with you
            wsconn.invoke('AnswerCall', false, callingUser).catch(err => console.log(err));
        }
    });
});

// Hub Callback: WebRTC Signal Received
wsconn.on('ReceiveSignal', (signalingUser, signal) => {
    //console.log('WebRTC: receive signal ');
    //console.log(signalingUser);
    //console.log('NewSignal', signal);
    newSignal(signalingUser.connectinId, signal);
});

// Hub Callback: Call Ended
wsconn.on('CallEnded', (signalingUser, signal) => {
    //console.log(signalingUser);
    //console.log(signal);

    console.log('SignalR: call with ' + signalingUser.connectionId + ' has ended: ' + signal);

    // Let the user know why the server says the call is over
    alertify.error(signal);

    // Close the WebRTC connection
    //closeConnection(signalingUser.connectionId);

    // Set the UI back into idle mode
});


window['app'] = createApp({
    data() {
        return {
            message: '',
            users: null,
            chats: null,
            selectedUser: null
            //    [
            //    { id: 1, fromUser: 1, toUser: 2, message: 'Hello Vue!', time: '2022-05-12T23:16:21.4927953' },
            //],
        }
    },
    async mounted() {
        var o = await wsconn.start();
        initializeUserMedia();
        var u = sessionStorage.getItem('id');
        var res = await fetch("/Chat/UpdateConnId", { body: JSON.stringify({ id: u, connectionId: wsconn.connection.connectionId }), method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (res.ok) this.GetUsers();
    },
    methods: {
        async GetUsers() {
            var res = await fetch("/Chat/GetUsers");
            var data = await res.json();
            data.forEach(o => o["selected"] = false);
            if (this.selectedUser) {
                this.selectedUser = data.find(o => o.id == this.selectedUser.id);
                this.selectedUser.selected = true;
            }
            this.users = data;
        },
        async userClick(i) {
            this.users.forEach(o => o["selected"] = false);
            i.selected = true;
            this.selectedUser = i;
            var frm = sessionStorage.getItem('id');
            var res = await fetch(`/Chat/GetChats?from=${i.id}&me=${frm}`);
            var data = await res.json();
            data.forEach(o => {
                o["isFrom"] = o.toUser == frm;
                o["name"] = o["isFrom"] ? i.name : "Me";
                var t = moment(o.time);
                o.time = t.format('hh:mm:ssa DD-MM-yy');
            });
            this.chats = data;

            this.chatScrollToBottom(1000);
        },
        sendClick() {
            var frm = sessionStorage.getItem('id');
            var to = this.users.find(o => o.selected);
            this.addChat(0, frm, to, this.message, new Date(), false);
            wsconn.invoke("SendMessage", frm + "|" + to.id, this.message).catch(function (err) {
                return console.error(err.toString());
            });
            this.message = "";
        },
        addChat(id, fromUser, toUser, message, time, isFrom, fileName = null) {
            var name = this.users.find(o => o.selected).name;
            var t = moment(time);
            this.chats.push({ id: id, fromUser: fromUser, toUser: toUser, message: message, time: t.format('hh:mm:ssa DD-MM-yy'), isFrom: isFrom, name: isFrom ? name : "Me", fileName: fileName });
            this.chatScrollToBottom(0);
        },
        chatScrollToBottom(delay) {
            var elm = document.querySelector(".msgcont");
            if (elm) {
                setTimeout(() => {
                    elm.scrollTop = elm.scrollHeight;
                }, delay);
            }
        },
        onKeyPress(e) {
            if (e.key == 'Enter') {
                this.sendClick();
                e.preventDefault();
            }
            if (e.key == "\n") {
                var elm = e.target;//as HTMLTextAreaElement;
                var curPos = elm.selectionStart;
                elm.value = elm.value.slice(0, curPos) + "\n" + elm.value.slice(curPos);
            }
        },
        async onFileChange(e) {
            if (e.target.files) {
                var file = e.target.files[0];// as File;
                var frm = sessionStorage.getItem('id');
                var to = this.users.find(o => o.selected);
                var fd = new FormData();
                fd.append("file", file, file.name);
                fd.append("from", frm);
                fd.append("to", to.id);
                fd.append("message", this.message);
                var res = await fetch("/Chat/FileUpload", {
                    method: 'POST', body: fd
                });
                var json = await res.json();
                if (res.ok) {
                    this.addChat(json.chatId, frm, to.id, this.message, new Date(), false, file.name);
                    this.message = "";
                }
            }
        },
        isImage(fn) {
            var arr = fn.split('.');
            var ext = arr[arr.length - 1].toLowerCase();
            return ["jpg", "png", "jpeg", "gif"].find(o => o == ext);
        },

        onCallButton() {

            console.log(this.selectedUser);
            var connId = this.selectedUser.connectinId;
            wsconn.invoke('CallUser', { "ConnectinId": connId });
        },
        onEndCallButton() {
            wsconn.invoke('HangUp');
            closeAllConnections();
        }
    }
}).mount('#vapp')