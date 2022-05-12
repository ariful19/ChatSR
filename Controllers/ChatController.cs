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
    }

    public class ConIdUpdModel
    {
        public int Id { get; set; }
        public string ConnectionId { get; set; }
    }
}
