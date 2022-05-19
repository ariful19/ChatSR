const { createApp } = Vue;
"use strict";

// Get our hostname

var myHostname = window.location.hostname;
if (!myHostname) {
    myHostname = "localhost";
}
log("Hostname: " + myHostname);

// WebSocket chat/signaling channel variables.

var connection = null;
var clientID = 0;
var mediaConstraints = {
    audio: true,            // We want an audio track
    video: {
        aspectRatio: {
            ideal: 1.333333     // 3:2 aspect is preferred
        }
    }
};

var myUsername = null;
var targetUsername = null;      // To store username of other peer
var myPeerConnection = null;    // RTCPeerConnection
var transceiver = null;         // RTCRtpTransceiver
var webcamStream = null;        // MediaStream from webcam

function log(text) {
    var time = new Date();

    console.log("[" + time.toLocaleTimeString() + "] " + text);
}

// Output an error message to console.

function log_error(text) {
    var time = new Date();

    console.trace("[" + time.toLocaleTimeString() + "] " + text);
}

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

const errorHandler = (error) => {
    if (error.message)
        alertify.alert('<h4>Error Occurred</h4></br>Error Info: ' + JSON.stringify(error.message));
    else
        alertify.alert('<h4>Error Occurred</h4></br>Error Info: ' + JSON.stringify(error));

    console.log(error);
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
    //{"id":1,"name":"arif","email":"","connectinId":"4lcWxCJVyye8F7tiqsO--A"}
    invite();
    //var t = setInterval(() => {
    //    if (yourConn) {
    //        clearInterval(t);
    //        window.app.callStarted = true;
    //        yourConn.createOffer(function (offer) {
    //            console.log(offer);
    //            wsconn.invoke('Message', "offer", JSON.stringify({ Offer: JSON.stringify(offer), ConnectionId: window.app.selectedUser.connectinId })).catch(errorHandler);

    //            yourConn.setLocalDescription(offer);
    //        }, function (error) {
    //            alert("Error when creating an offer");
    //        });
    //    }
    //}, 500);
});
// offer
wsconn.on('Offer', async (off, connetionId) => {

    var offer = JSON.parse(off);
    // If we're not already connected, create an RTCPeerConnection
    // to be linked to the caller.

    log("Received video chat offer from " + connetionId);
    if (!myPeerConnection) {
        createPeerConnection();
    }

    // We need to set the remote description to the received SDP offer
    // so that our local WebRTC layer knows how to talk to the caller.

    var desc = new RTCSessionDescription(offer);

    // If the connection isn't stable yet, wait for it...

    if (myPeerConnection.signalingState != "stable") {
        log("  - But the signaling state isn't stable, so triggering rollback");

        // Set the local and remove descriptions for rollback; don't proceed
        // until both return.
        await Promise.all([
            myPeerConnection.setLocalDescription({ type: "rollback" }),
            myPeerConnection.setRemoteDescription(desc)
        ]);
        return;
    } else {
        log("  - Setting remote description");
        await myPeerConnection.setRemoteDescription(desc);
    }

    // Get the webcam stream if we don't already have it

    if (!webcamStream) {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        } catch (err) {
            handleGetUserMediaError(err);
            return;
        }

        document.getElementById("local_video").srcObject = webcamStream;

        // Add the camera stream to the RTCPeerConnection

        try {
            webcamStream.getTracks().forEach(
                transceiver = track => myPeerConnection.addTransceiver(track, { streams: [webcamStream] })
            );
        } catch (err) {
            handleGetUserMediaError(err);
        }
    }

    log("---> Creating and sending answer to caller");

    await myPeerConnection.setLocalDescription(await myPeerConnection.createAnswer());
    wsconn.invoke('Message', "answer", JSON.stringify({ Answer: JSON.stringify(myPeerConnection.localDescription), ConnectionId: connetionId })).catch(errorHandler);
    //sendToServer({
    //    name: myUsername,
    //    target: targetUsername,
    //    type: "video-answer",
    //    sdp: myPeerConnection.localDescription
    //});
});

function handleGetUserMediaError(e) {
    log_error(e);
    switch (e.name) {
        case "NotFoundError":
            alert("Unable to open your call because no camera and/or microphone" +
                "were found.");
            break;
        case "SecurityError":
        case "PermissionDeniedError":
            // Do nothing; this is the same as the user canceling the call.
            break;
        default:
            alert("Error opening your camera and/or microphone: " + e.message);
            break;
    }

    // Make sure we shut down our end of the RTCPeerConnection so we're
    // ready to try again.

    closeVideoCall();
}
function closeVideoCall() {
    var localVideo = document.getElementById("local_video");

    log("Closing the call");

    // Close the RTCPeerConnection

    if (myPeerConnection) {
        log("--> Closing the peer connection");

        // Disconnect all our event listeners; we don't want stray events
        // to interfere with the hangup while it's ongoing.

        myPeerConnection.ontrack = null;
        myPeerConnection.onnicecandidate = null;
        myPeerConnection.oniceconnectionstatechange = null;
        myPeerConnection.onsignalingstatechange = null;
        myPeerConnection.onicegatheringstatechange = null;
        myPeerConnection.onnotificationneeded = null;

        // Stop all transceivers on the connection

        myPeerConnection.getTransceivers().forEach(transceiver => {
            transceiver.stop();
        });

        // Stop the webcam preview as well by pausing the <video>
        // element, then stopping each of the getUserMedia() tracks
        // on it.

        if (localVideo.srcObject) {
            localVideo.pause();
            localVideo.srcObject.getTracks().forEach(track => {
                track.stop();
            });
        }

        // Close the peer connection

        myPeerConnection.close();
        myPeerConnection = null;
        webcamStream = null;
    }

    // Disable the hangup button

    //document.getElementById("hangup-button").disabled = true;
    targetUsername = null;
}

wsconn.on('Answer', async (answer, connetionId) => {
    log("*** Call recipient has accepted our call");

    // Configure the remote description, which is the SDP payload
    // in our "video-answer" message.

    var desc = new RTCSessionDescription(JSON.parse(answer));
    await myPeerConnection.setRemoteDescription(desc).catch(reportError);
});

wsconn.on('Candidate', async (candidate, connetionId) => {
    var cand = JSON.parse(candidate);

    log("*** Adding received ICE candidate: " + JSON.stringify(cand));
    try {
        await myPeerConnection.addIceCandidate(cand)
    } catch (err) {
        reportError(err);
    }
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
    window.app.selectedUser = window.app.users.find(o => o.id == callingUser.id);
    window.app.userClick(window.app.selectedUser);
    // Ask if we want to talk
    alertify.confirm(callingUser.name + ' is calling.  Do you want to chat?', function (e) {
        if (e) {
            // I want to chat
            wsconn.invoke('AnswerCall', true, callingUser).catch(err => console.log(err));
            window.app.callStarted = true;
        } else {
            // Go away, I don't want to chat with you
            wsconn.invoke('AnswerCall', false, callingUser).catch(err => console.log(err));
        }
    });
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
async function invite() {
    log("Starting to prepare an invitation");
    if (myPeerConnection) {
        alert("You can't start a call because you already have one open!");
    } else {
        var clickedUsername = window.app.selectedUser.name;

        // Don't allow users to call themselves, because weird.

        if (clickedUsername === myUsername) {
            alert("I'm afraid I can't let you talk to yourself. That would be weird.");
            return;
        }

        // Record the username being called for future reference

        targetUsername = clickedUsername;
        log("Inviting user " + targetUsername);

        // Call createPeerConnection() to create the RTCPeerConnection.
        // When this returns, myPeerConnection is our RTCPeerConnection
        // and webcamStream is a stream coming from the camera. They are
        // not linked together in any way yet.

        log("Setting up connection to invite user: " + targetUsername);
        createPeerConnection();

        // Get access to the webcam stream and attach it to the
        // "preview" box (id "local_video").

        try {
            webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            document.getElementById("local_video").srcObject = webcamStream;
        } catch (err) {
            handleGetUserMediaError(err);
            return;
        }

        // Add the tracks from the stream to the RTCPeerConnection

        try {
            webcamStream.getTracks().forEach(
                transceiver = track => myPeerConnection.addTransceiver(track, { streams: [webcamStream] })
            );
        } catch (err) {
            handleGetUserMediaError(err);
        }
    }
}

async function createPeerConnection() {
    log("Setting up a connection...");

    // Create an RTCPeerConnection which knows to use our chosen
    // STUN server.

    myPeerConnection = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.stunprotocol.org"
            },
            {
                urls: 'turn:numb.viagenie.ca',
                credential: 'muazkh',
                username: 'webrtc@live.com'
            },
        ]
    });

    // Set up event handlers for the ICE negotiation process.

    myPeerConnection.onicecandidate = handleICECandidateEvent;
    myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
    myPeerConnection.ontrack = handleTrackEvent;
}
function handleTrackEvent(event) {
    log("*** Track event");
    document.getElementById("received_video").srcObject = event.streams[0];
    /*document.getElementById("hangup-button").disabled = false;*/
}
function handleSignalingStateChangeEvent(event) {
    log("*** WebRTC signaling state changed to: " + myPeerConnection.signalingState);
    switch (myPeerConnection.signalingState) {
        case "closed":
            closeVideoCall();
            break;
    }
}
function handleICEGatheringStateChangeEvent(event) {
    log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);
}
function handleICEConnectionStateChangeEvent(event) {
    log("*** ICE connection state changed to " + myPeerConnection.iceConnectionState);

    switch (myPeerConnection.iceConnectionState) {
        case "closed":
        case "failed":
        case "disconnected":
            closeVideoCall();
            break;
    }
}
function handleICECandidateEvent(event) {
    if (event.candidate) {
        log("*** Outgoing ICE candidate: " + event.candidate.candidate);

        //sendToServer({
        //    type: "new-ice-candidate",
        //    target: targetUsername,
        //    candidate: event.candidate
        //});
        wsconn.invoke("Message", "candidate", JSON.stringify({ Candidate: JSON.stringify(event.candidate), ConnectionId: window.app.selectedUser.connectinId }))
    }
}
// Called by the WebRTC layer to let us know when it's time to
// begin, resume, or restart ICE negotiation.

async function handleNegotiationNeededEvent() {
    log("*** Negotiation needed");

    try {
        log("---> Creating offer");
        const offer = await myPeerConnection.createOffer();

        // If the connection hasn't yet achieved the "stable" state,
        // return to the caller. Another negotiationneeded event
        // will be fired when the state stabilizes.

        if (myPeerConnection.signalingState != "stable") {
            log("     -- The connection isn't stable yet; postponing...")
            return;
        }

        // Establish the offer as the local peer's current
        // description.

        log("---> Setting local description to the offer");
        await myPeerConnection.setLocalDescription(offer);

        // Send the offer to the remote peer.

        log("---> Sending the offer to the remote peer");
        //sendToServer({
        //    name: myUsername,
        //    target: targetUsername,
        //    type: "video-offer",
        //    sdp: myPeerConnection.localDescription
        //});
        wsconn.invoke('Message', "offer", JSON.stringify({ Offer: JSON.stringify(myPeerConnection.localDescription), ConnectionId: window.app.selectedUser.connectinId })).catch(errorHandler);
    } catch (err) {
        log("*** The following error occurred while handling the negotiationneeded event:");
        reportError(err);
    };
}
function reportError(errMessage) {
    log_error(`Error ${errMessage.name}: ${errMessage.message}`);
}

window['app'] = createApp({
    data() {
        return {
            message: '',
            users: null,
            chats: null,
            selectedUser: null,
            callStarted: false
            //    [
            //    { id: 1, fromUser: 1, toUser: 2, message: 'Hello Vue!', time: '2022-05-12T23:16:21.4927953' },
            //],
        }
    },
    async mounted() {
        var o = await wsconn.start();
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
            remoteAudio.src = null;

            yourConn.close();
            yourConn.onicecandidate = null;
            yourConn.onaddstream = null;
            this.callStarted = false;
        }
    }
}).mount('#vapp')