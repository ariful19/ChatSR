using ChatSR.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatSR.Controllers
{
    public class ChatController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }

        public async Task<IActionResult> GetUsers()
        {
            using (var ctx = new ChatDbContext())
            {
                var users = await ctx.Users.ToListAsync();
                return Json(users);
            }
        }

        public async Task<IActionResult> UpdateConnId([FromBody] ConIdUpdModel model)
        {
            using (var ctx = new ChatDbContext())
            {
                var u = await ctx.Users.FirstAsync(o => o.Id == model.Id);
                u.ConnectinId = model.ConnectionId;
                await ctx.SaveChangesAsync();
                return Ok();
            }
        }

        public async Task<IActionResult> GetChats([FromQuery]int from,[FromQuery]int me)
        {
            using var ctx= new ChatDbContext();
            var q = ctx.Chats.Where(o => o.FromUser == from && o.ToUser == me || o.FromUser == me && o.ToUser == from);
            var list = await q.ToListAsync();
            return Json(list);
        }
    }

    public class ConIdUpdModel
    {
        public int Id { get; set; }
        public string ConnectionId { get; set; }
    }
}
