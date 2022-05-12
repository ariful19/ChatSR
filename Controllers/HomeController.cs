using ChatSR.Models;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;

namespace ChatSR.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;

        public HomeController(ILogger<HomeController> logger)
        {
            _logger = logger;
        }

        public IActionResult Index()
        {
            return View();
        }

        public IActionResult UserCheck([FromBody] User user)
        {
            using (var ctx = new ChatDbContext())
            {
                var u = ctx.Users.FirstOrDefault(o => o.Name.ToLower() == user.Name.ToLower());
                if (u == null)
                {
                    var id = ctx.Users.Any() ? ctx.Users.Max(o => o.Id) + 1 : 1;
                    user.Id = id;
                    ctx.Users.Add(user);
                    ctx.SaveChanges();
                }
                else
                    user = u;

            }
            return Json(user);
        }
    }
}