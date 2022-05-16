const { createApp } = Vue;

var connection = new signalR.HubConnectionBuilder().withAutomaticReconnect().withUrl("/chatHub").build();
connection.on("ReceiveMessage", function (user, message) {
    var msg = JSON.parse(message);//{Id: 7, FromUser: 2, ToUser: 1, Message: 'Hello Vue! c', Time: '2022-05-13T12:02:18.0842484+06:00'}
    var u = sessionStorage.getItem('id');
    window.app.addChat(msg.Id, msg.FromUser, msg.ToUser, msg.Message, msg.Time, msg.ToUser == u, msg.FileName);
    window.app.chatScrollToBottom(0);
});
connection.on("UserUpdated", function (user, message) {
    window.app.GetUsers();
});

window['app'] = createApp({
    data() {
        return {
            message: '',
            users: null,
            chats: null
            //    [
            //    { id: 1, fromUser: 1, toUser: 2, message: 'Hello Vue!', time: '2022-05-12T23:16:21.4927953' },
            //],
        }
    },
    async mounted() {
        var o = await connection.start();
        var u = sessionStorage.getItem('id');
        var res = await fetch("/Chat/UpdateConnId", { body: JSON.stringify({ id: u, connectionId: connection.connection.connectionId }), method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (res.ok) this.GetUsers();
    },
    methods: {
        async GetUsers() {
            var res = await fetch("/Chat/GetUsers");
            var data = await res.json();
            data.forEach(o => o["selected"] = false);
            this.users = data;
        },
        async userClick(i) {
            this.users.forEach(o => o["selected"] = false);
            i.selected = true;
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
            connection.invoke("SendMessage", frm + "|" + to.id, this.message).catch(function (err) {
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
        }
    }
}).mount('#vapp')