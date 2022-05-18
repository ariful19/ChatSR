const { createApp } = Vue;
var localAudio = document.querySelector('#localAudio');
var remoteAudio = document.querySelector('#remoteAudio');

var yourConn;
var stream;
var partnerClientId;

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
function initUserMedia() {
    navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((myStream) => {
        stream = myStream;

        //displaying local audio stream on the page 
        localAudio.srcObject = stream;

        //using Google public stun server 
        var configuration = {
            "iceServers": [{ "url": "stun:stun2.1.google.com:19302" }]
        };

        yourConn = new RTCPeerConnection(configuration);

        // setup stream listening 
        yourConn.addStream(stream);

        //when a remote user adds stream to the peer connection, we display it 
        yourConn.onaddstream = function (e) {
            remoteAudio.srcObject = e.stream;
        };

        // Setup ice handling 
        yourConn.onicecandidate = function (event) {
            console.log(window.app.selectedUser.name + ": n cand");
            if (event.candidate) {
                wsconn.invoke("Message", "candidate", JSON.stringify({ Candidate: JSON.stringify(event.candidate), ConnectionId: window.app.selectedUser.connectinId }))
            }
        };

    }, (error) => {
        console.log(error);
    });

}

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
    initUserMedia();
    var t = setInterval(() => {
        if (yourConn) {
            clearInterval(t);
            window.app.callStarted = true;
            yourConn.createOffer(function (offer) {
                console.log(offer);
                wsconn.invoke('Message', "offer", JSON.stringify({ Offer: JSON.stringify(offer), ConnectionId: window.app.selectedUser.connectinId })).catch(errorHandler);

                yourConn.setLocalDescription(offer);
            }, function (error) {
                alert("Error when creating an offer");
            });
        }
    }, 500);
});
// offer
wsconn.on('Offer', (offer, connetionId) => {
    var off = JSON.parse(offer);

    yourConn.setRemoteDescription(new RTCSessionDescription(off));

    //create an answer to an offer 
    yourConn.createAnswer(function (answer) {
        yourConn.setLocalDescription(answer);
        wsconn.invoke('Message', "answer", JSON.stringify({ Answer: JSON.stringify(answer), ConnectionId: connetionId })).catch(errorHandler);

    }, function (error) {
        alert("Error when creating an answer");
    });
});

wsconn.on('Answer', (answer, connetionId) => {
    var ans = JSON.parse(answer);
    yourConn.setRemoteDescription(new RTCSessionDescription(ans));

});

wsconn.on('Candidate', (candidate, connetionId) => {
    var cand = JSON.parse(candidate);

    yourConn.addIceCandidate(new RTCIceCandidate(cand));
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
            initUserMedia();
        } else {
            // Go away, I don't want to chat with you
            wsconn.invoke('AnswerCall', false, callingUser).catch(err => console.log(err));
        }
    });
});

// Hub Callback: WebRTC Signal Received
wsconn.on('Candidate', (candidate, fromConn) => {
    yourConn.addIceCandidate(new RTCIceCandidate(candidate));

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