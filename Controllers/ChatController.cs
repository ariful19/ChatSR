using ChatSR.Hubs;
using ChatSR.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatSR.Controllers
{
    public class ChatController : Controller
    {
        private IHubContext<ChatHub> chatHub;

        public ChatController(IHubContext<ChatHub> hubcontext)
        {
            this.chatHub = hubcontext;
        }
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

        public async Task<IActionResult> GetChats([FromQuery] int from, [FromQuery] int me)
        {
            using var ctx = new ChatDbContext();
            var q = ctx.Chats.Where(o => o.FromUser == from && o.ToUser == me || o.FromUser == me && o.ToUser == from);
            var list = await q.ToListAsync();
            return Json(list);
        }

        [HttpPost]
        public async Task<IActionResult> FileUpload([FromForm] UploadFileModel model)
        {
            using var ctx = new ChatDbContext();
            model.message = model.message ?? "";
            User? toUseru = await ctx.Users.FirstAsync(o => o.Id == model.to);
            User? fromUser = await ctx.Users.FirstAsync(o => o.Id == model.from);
            var id = await ctx.Chats.AnyAsync() ? await ctx.Chats.MaxAsync(o => o.Id) + 1 : 1;

            var chat = new Chat { FromUser = model.from, ToUser = model.to, Id = id, Message = model.message, Time = DateTime.Now };
            if (model.file != null)
            {
                chat.FileName = model.file.FileName;
                var folder = AppDomain.CurrentDomain.BaseDirectory + "\\ChatFiles";
                System.IO.Directory.CreateDirectory(folder);
                using var fs = System.IO.File.OpenWrite(folder + "\\" + id + "_" + model.file.FileName);
                await model.file.CopyToAsync(fs);
                await fs.FlushAsync();
            }
            ctx.Chats.Add(chat);
            if (toUseru != null && toUseru.ConnectinId != null)
            {
                var json = System.Text.Json.JsonSerializer.Serialize(chat);
                await this.chatHub.Clients.Client(toUseru.ConnectinId).SendAsync("ReceiveMessage", fromUser.Name, json);
            }
            await ctx.SaveChangesAsync();
            return Json(new { chatId = id });
        }

        public async Task<IActionResult> GetFile([FromQuery] string fn)
        {
            var fnn = AppDomain.CurrentDomain.BaseDirectory + "\\ChatFiles\\" + fn;
            var n = fn.Split("_");
            if (System.IO.File.Exists(fnn))
            {
                using var fs = System.IO.File.OpenRead(fnn);
                var bytes = new byte[fs.Length];
                await fs.ReadAsync(bytes, 0,(int)fs.Length);
                return File(bytes, "application/octet-stream", n[1]);
            }
            return NotFound();
        }
    }

    public class UploadFileModel
    {
        public int from { get; set; }
        public int to { get; set; }
        public string message { get; set; } = "";
        public IFormFile? file { get; set; }
    }

    public class ConIdUpdModel
    {
        public int Id { get; set; }
        public string ConnectionId { get; set; }
    }
}
