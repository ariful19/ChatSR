using ChatSR.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatSR.Hubs
{
    public class ChatHub : Hub
    {
        public async Task SendMessagex(string toUser, string message)
        {
            await Clients.All.SendAsync(toUser, message);
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
                if (toUseru != null && toUseru.ConnectinId != null)
                {
                    await Clients.Client(toUseru.ConnectinId).SendAsync("ReceiveMessage", fromUser.Name, message);
                }
                var id = await ctx.Chats.AnyAsync() ? await ctx.Chats.MaxAsync(o => o.Id) + 1 : 1;
                ctx.Chats.Add(new Chat { FromUser = fromi, ToUser = toi, Id = id, Message = message, Time = DateTime.Now });
                await ctx.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                System.IO.File.AppendAllText("log.txt", ex.Message);
            }
        }
    }
}
