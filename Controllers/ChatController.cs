﻿using Microsoft.AspNetCore.Mvc;

namespace ChatSR.Controllers
{
    public class ChatController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}
