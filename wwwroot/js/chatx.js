const { createApp } = Vue;

var connection = new signalR.HubConnectionBuilder().withAutomaticReconnect().withUrl("/chatHub").build();
connection.on("ReceiveMessage", function (user, message) {
    console.log(`${user} says ${message}`);
});

createApp({
    data() {
        return {
            message: 'Hello Vue!',
            users: null
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
        userClick(i) {
            this.users.forEach(o => o["selected"] = false);
            i.selected = true;
        },
        sendClick() {
            var frm = sessionStorage.getItem('id');
            var to = this.users.find(o => o.selected);
            connection.invoke("SendMessage", frm+"|"+to.id, this.message).catch(function (err) {
                return console.error(err.toString());
            });
        }
    }
}).mount('#vapp')