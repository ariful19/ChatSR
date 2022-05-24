const { createApp } = Vue;
//"use strict";
var peer = null; // own peer object
var lastPeerId = null;
var conn = null;

function initialize(id) {
    // Create own peer object with connection to shared PeerJS server
    return new Promise((resolve, reject) => {

        peer = new Peer(id, {
            config: {
                'iceServers': [
                    { url: 'stun:stun.stunprotocol.org:3478' },
                ]
            } /* Sample servers, please use appropriate ones */
        });

        peer.on('open', function (id) {
            // Workaround for peer.reconnect deleting previous id
            if (peer.id === null) {
                console.log('Received null id from peer open');
                peer.id = lastPeerId;
            } else {
                lastPeerId = peer.id;
            }
            resolve(peer.id);
            console.log('ID: ' + peer.id);
        });
        peer.on('connection', function (c) {

        });
        peer.on('disconnected', function () {
            console.log('Connection lost. Please reconnect');
        });
        peer.on('close', function () {
            conn = null;
            console.log('Connection destroyed');
        });
        peer.on('error', function (err) {
            console.log(err);
            alert('' + err);
            reject(err);
        });
        peer.on("call", async (call) => {
            if (!window.localStream) await initLocalStream();
            call.answer(window.localStream);

            call.on('stream', function (stream) {
                document.getElementById("received_video").srcObject = stream;
                console.log("received Stream");
            });
        });
    });
};
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
    var su = window.app.users.find(o => o.id == msg.FromUser);
    if (!su.selected)
        window.app.userClick(su);
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
wsconn.on('CallAccepted', async (acceptingUser) => {
    console.log('SignalR: call accepted from: ' + JSON.stringify(acceptingUser) + '.  Initiating WebRTC call and offering my stream up...');
    if (!peer) {
        await initialize(window.app.getMyConnectionId());
    }
    await initLocalStream();
    var call = peer.call(acceptingUser.connectinId, window.localStream);
    call.answer(window.localStream);
    call.on('stream', function (stream) {
        document.getElementById("received_video").srcObject = stream;
        console.log("received Stream");
    });
    log("calling " + acceptingUser.name);
    window.app.callStarted = true;
});
async function initLocalStream() {
    var um = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    document.getElementById("local_video").srcObject = um;
    window.localStream = um;
}
// offer
wsconn.on('PeerId', async (peerId, connetionId) => {
    console.log(peerId + "|" + connetionId)

});

wsconn.on('Answer', async (answer, connetionId) => {

});

wsconn.on('Candidate', async (candidate, connetionId) => {

});
// Hub Callback: Call Declined
wsconn.on('CallDeclined', (decliningUser, reason) => {
    console.log('SignalR: call declined from: ' + decliningUser.connectionId);

    // Let the user know that the callee declined to talk
    alertify.error(reason);

    // Back to an idle UI
    //$('body').attr('data-mode', 'idle');
    window.app.callStarted = false;

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
            initialize(window.app.getMyConnectionId());
            initLocalStream();
        } else {
            // Go away, I don't want to chat with you
            wsconn.invoke('AnswerCall', false, callingUser).catch(err => console.log(err));
        }
    });
});


// Hub Callback: Call Ended
wsconn.on('CallEnded', () => {
    //console.log(signalingUser);
    //console.log(signal);

    console.log('SignalR: call ended');

    // Let the user know why the server says the call is over
    alertify.error(signal);
    window.app.onEndCallButton();

});

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
            callStarted: false,
            callEnabled: false
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
        //var v1 = document.getElementById("local_video");
        //var v2 = document.getElementById("received_video");
        //v1.addEventListener("loadedmetadata", () => {
        //    v1.play();
        //});
        //v2.addEventListener("loadedmetadata", () => {
        //    v2.play();
        //});
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

            this.chatScrollToBottom(100);
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
            var ivalelm = setInterval(() => {
                var elm = document.querySelector(".msgcont");// as HTMLElement;
                if (elm) {
                    setTimeout(() => {
                        elm.scrollTop = elm.scrollHeight;
                    }, delay);
                    clearInterval(ivalelm);
                }
            }, delay / 2);
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
            document.getElementById("local_video").srcObject = null;
            document.getElementById("received_video").srcObject = null;
            peer.disconnect();
            peer = null;
            this.callStarted = false;
        },
        getMyConnectionId() {
            var id = sessionStorage.getItem('id');
            return this.users.find(o => o.id == id).connectinId;
        }
    }
}).mount('#vapp')