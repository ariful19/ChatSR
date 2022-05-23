using ChatSR.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Dynamic;
using System.Text.Json;

namespace ChatSR.Hubs
{
    public class ChatHub : Hub
    {
        private readonly List<CallOffer> _CallOffers;
        public ChatHub(List<CallOffer> callOffers)
        {
            _CallOffers = callOffers;
        }
        public async Task SendMessagex(string toUser, string message)
        {
            await Clients.All.SendAsync(toUser, message);
        }
        public async Task UserUpdated(string toUser, string message)
        {
            await Clients.All.SendAsync("UserUpdated", toUser, message);
        }
        public async Task SendMessage(string toUser, string message)
        {
            try
            {
                var arr = toUser.Split('|');
                var from = arr[0];
                toUser = arr[1];
                using var ctx = new ChatDbContext();
                var fromi = int.Parse(from);
                var toi = int.Parse(toUser);
                User? toUseru = await ctx.Users.FirstAsync(o => o.Id == toi);
                User? fromUser = await ctx.Users.FirstAsync(o => o.Id == fromi);
                var id = await ctx.Chats.AnyAsync() ? await ctx.Chats.MaxAsync(o => o.Id) + 1 : 1;
                var chat = new Chat { FromUser = fromi, ToUser = toi, Id = id, Message = message, Time = DateTime.Now };
                ctx.Chats.Add(chat);
                if (toUseru != null && toUseru.ConnectinId != null)
                {
                    var json = System.Text.Json.JsonSerializer.Serialize(chat);
                    await Clients.Client(toUseru.ConnectinId).SendAsync("ReceiveMessage", fromUser.Name, json);
                }
                await ctx.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                System.IO.File.AppendAllText("log.txt", ex.Message);
            }
        }

        #region calls
        public async Task Message(string message, string obj)
        {
            try
            {
                switch (message)
                {
                    case "candidate":
                        var xobj = System.Text.Json.JsonSerializer.Deserialize<ObjCandidate>(obj);
                        await Clients.Client(xobj.ConnectionId).SendAsync("Candidate", xobj.Candidate, Context.ConnectionId);
                        break;
                    case "offer":
                        var xobj1 = System.Text.Json.JsonSerializer.Deserialize<ObjOffer>(obj);
                        await Clients.Client(xobj1.ConnectionId).SendAsync("Offer", xobj1.Offer, Context.ConnectionId);
                        break;
                    case "answer":
                        var xobj2 = System.Text.Json.JsonSerializer.Deserialize<ObjAnswer>(obj);
                        await Clients.Client(xobj2.ConnectionId).SendAsync("Answer", xobj2.Answer, Context.ConnectionId);
                        break;
                    case "peerId":
                        var xobj3 = System.Text.Json.JsonSerializer.Deserialize<ObjPeerId>(obj);
                        await Clients.Client(xobj3.ConnectionId).SendAsync("PeerId", xobj3.PeerId, Context.ConnectionId);
                        break;
                    default:
                        break;
                }
            }
            catch (Exception ex)
            {

            }
        }

        public async Task SendSignal(string signal, string targetConnectionId)
        {
            using var ctx = new ChatDbContext();

            var callingUser = ctx.Users.SingleOrDefault(u => u.ConnectinId == Context.ConnectionId);
            var targetUser = ctx.Users.SingleOrDefault(u => u.ConnectinId == targetConnectionId);

            // Make sure both users are valid
            if (callingUser == null || targetUser == null)
            {
                return;
            }

            // Make sure that the person sending the signal is in a call
            //var userCall = GetUserCall(callingUser.ConnectionId);

            // ...and that the target is the one they are in a call with
            await Clients.Client(targetConnectionId).SendAsync("ReceiveSignal", callingUser, signal);
            //if (userCall != null && userCall.Users.Exists(u => u.ConnectionId == targetUser.ConnectionId))
            //{
            //    // These folks are in a call together, let's let em talk WebRTC
            //}
        }
        public async Task CallUser(User targetConnectionId)
        {
            using var ctx = new ChatDbContext();
            var callingUser = ctx.Users.SingleOrDefault(u => u.ConnectinId == Context.ConnectionId);
            var targetUser = ctx.Users.SingleOrDefault(u => u.ConnectinId == targetConnectionId.ConnectinId);

            // Make sure the person we are trying to call is still here
            if (targetUser == null)
            {
                // If not, let the caller know
                await Clients.Caller.SendAsync("CallDeclined", targetConnectionId, "The user you called has left.");
                return;
            }

            // And that they aren't already in a call
            //if (GetUserCall(targetUser.ConnectionId) != null)
            //{
            //    await Clients.Caller.CallDeclined(targetConnectionId, string.Format("{0} is already in a call.", targetUser.Username));
            //    return;
            //}

            // They are here, so tell them someone wants to talk
            if (targetConnectionId.ConnectinId != null)
                await Clients.Client(targetConnectionId.ConnectinId).SendAsync("IncomingCall", callingUser);

            // Create an offer
            _CallOffers.Add(new CallOffer
            {
                Caller = callingUser,
                Callee = targetUser
            });
        }

        public async Task AnswerCall(bool acceptCall, User targetConnectionId)
        {
            using var ctx = new ChatDbContext();
            var callingUser = ctx.Users.SingleOrDefault(u => u.ConnectinId == Context.ConnectionId);
            var targetUser = ctx.Users.SingleOrDefault(u => u.ConnectinId == targetConnectionId.ConnectinId);

            // This can only happen if the server-side came down and clients were cleared, while the user
            // still held their browser session.
            if (callingUser == null)
            {
                return;
            }

            // Make sure the original caller has not left the page yet
            if (targetUser == null)
            {
                await Clients.Caller.SendAsync("CallEnded", targetConnectionId, "The other user in your call has left.");
                return;
            }

            // Send a decline message if the callee said no
            if (acceptCall == false)
            {
                await Clients.Client(targetConnectionId.ConnectinId).SendAsync("CallDeclined", callingUser, string.Format("{0} did not accept your call.", callingUser.Name));
                return;
            }

            // Make sure there is still an active offer.  If there isn't, then the other use hung up before the Callee answered.
            //var offerCount = _CallOffers.RemoveAll(c => c.Callee.ConnectinId == callingUser.ConnectinId
            //                                      && c.Caller.ConnectinId == targetUser.ConnectinId);
            //if (offerCount < 1)
            //{
            //    await Clients.Caller.SendAsync("CallEnded", targetConnectionId, string.Format("{0} has already hung up.", targetUser.Name));
            //    return;
            //}

            //// And finally... make sure the user hasn't accepted another call already
            //if (GetUserCall(targetUser.ConnectionId) != null)
            //{
            //    // And that they aren't already in a call
            //    await Clients.Caller.CallDeclined(targetConnectionId, string.Format("{0} chose to accept someone elses call instead of yours :(", targetUser.Username));
            //    return;
            //}

            // Remove all the other offers for the call initiator, in case they have multiple calls out
            //_CallOffers.RemoveAll(c => c.Caller.ConnectinId == targetUser.ConnectinId);

            // Create a new call to match these folks up
            //_UserCalls.Add(new UserCall
            //{
            //    Users = new List<User> { callingUser, targetUser }
            //});

            // Tell the original caller that the call was accepted
            await Clients.Client(targetConnectionId.ConnectinId).SendAsync("CallAccepted", callingUser);

            // Update the user list, since thes two are now in a call
            //await SendUserListUpdate();
        }
        public async Task HangUp(string tgt)
        {

            // Remove all offers initiating from the caller
            _CallOffers.RemoveAll(c => c.Caller.ConnectinId == Context.ConnectionId || c.Callee.ConnectinId == Context.ConnectionId);
            await Clients.Client(tgt).SendAsync("CallEnded");
        }

        #endregion
    }

    internal class ObjPeerId
    {
        public string ConnectionId { get; set; }
        public string PeerId { get; set; }
    }

    internal class ObjAnswer
    {
        public string ConnectionId { get; set; }
        public string Answer { get; set; }
    }

    internal class ObjOffer
    {
        public string ConnectionId { get; set; }
        public string Offer { get; set; }
    }

    internal class ObjCandidate
    {
        public string ConnectionId { get; set; }
        public string Candidate { get; set; }
    }
}
